import {
  analyze,
  chunkBlocks,
  toContentTree,
  toMarkdown,
  type AnalyzeOptions,
  type Block,
  type Chunk,
  type ChunkOptions,
  type ContentNode,
  type DocumentMeta,
  type FigureBlock,
  type ImageDescriber,
  type OcrEngine,
} from "@docmarrow/core";
import { extractPdf } from "@docmarrow/pdf";
import { analyzeDocx } from "@docmarrow/docx";
import { analyzeXlsx } from "@docmarrow/xlsx";
import { analyzePptx } from "@docmarrow/pptx";
import { analyzeHtml } from "@docmarrow/html";
import { listEntries } from "@docmarrow/ooxml";

export type DocumentInput = Uint8Array | ArrayBuffer | ArrayBufferView;

export interface ParseOptions extends AnalyzeOptions {
  /** Input format. Autodetected from the file signature/content when omitted. */
  format?: "pdf" | "docx" | "xlsx" | "pptx" | "html";
  /**
   * "fast" = deterministic rule-based pipeline (default).
   * "boost" requires an enterprise refiner module and is not bundled in core.
   */
  mode?: "fast" | "boost";
  /** Password for encrypted PDFs. */
  password?: string;
  /**
   * Optional OCR engine (e.g. from `@docmarrow/ocr`). When provided, PDF pages
   * with no extractable text (scanned/image-only) are OCR'd and fed into the
   * pipeline. Without it, such pages are reported in `meta.warnings`.
   */
  ocr?: OcrEngine;
  /**
   * Optional image describer (e.g. a vision-LLM caption service). When provided,
   * every extracted figure with no source alt text is described and the caption
   * is written into the figure (so it serializes into Markdown and feeds RAG
   * chunks). Mirrors `ocr`: the core ships no describer, keeping it dependency-free.
   */
  describeImage?: ImageDescriber;
}

/** Parsed document with multiple synchronised representations. */
export interface ParsedDocument {
  /** Clean Markdown, ready for an LLM. */
  markdown: string;
  /** Structured blocks with type, page, bbox and confidence. */
  blocks: Block[];
  /** Uniform JSON content tree (for citations/pipelines). */
  json: ContentNode[];
  /** Blocks grouped by 1-based page index. */
  pages: Block[][];
  /** Document metadata: format, page count, title, hasText, warnings. */
  meta: DocumentMeta;
  /** Structure-aware chunking for RAG. */
  chunks(options?: ChunkOptions): Chunk[];
}

function toUint8(input: DocumentInput): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

type Format = "pdf" | "docx" | "xlsx" | "pptx" | "html";

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04 (OOXML is a zip)

/** Distinguish an OOXML zip by the marker part it contains. */
function detectOoxml(bytes: Uint8Array): "docx" | "xlsx" | "pptx" | null {
  let names: string[];
  try {
    names = listEntries(bytes);
  } catch {
    return null;
  }
  if (names.includes("word/document.xml")) return "docx";
  if (names.includes("xl/workbook.xml")) return "xlsx";
  if (names.includes("ppt/presentation.xml")) return "pptx";
  return null;
}

/** Heuristic sniff for HTML in the first bytes (doctype, <html>, or common tags). */
function looksLikeHtml(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, 1000))
    .trimStart()
    .toLowerCase();
  return (
    head.startsWith("<!doctype html") ||
    /^<html[\s>]/.test(head) ||
    /<(html|head|body|h[1-6]|p|div|table|ul|ol|article|section|main)[\s>]/.test(head)
  );
}

function detectFormat(bytes: Uint8Array): Format {
  if (PDF_MAGIC.every((b, i) => bytes[i] === b)) return "pdf";
  if (ZIP_MAGIC.every((b, i) => bytes[i] === b)) {
    const sub = detectOoxml(bytes);
    if (sub) return sub;
    throw new Error(
      "The input is a zip but not a recognised OOXML document (expected word/document.xml, " +
        "xl/workbook.xml or ppt/presentation.xml for DOCX/XLSX/PPTX).",
    );
  }
  if (looksLikeHtml(bytes)) return "html";
  throw new Error(
    "Unrecognised input: expected a PDF (%PDF), an OOXML document (DOCX/XLSX/PPTX zip), or HTML.",
  );
}

/**
 * Caption figures that lack alt text using the supplied describer. Figures that
 * already carry source alt text (HTML `alt`, OOXML `descr`) are left untouched.
 * A describer error leaves that figure undescribed (non-fatal). Runs in parallel.
 */
async function describeFigures(blocks: Block[], describer: ImageDescriber): Promise<void> {
  const pending = blocks.filter((b): b is FigureBlock => b.type === "figure" && !b.alt);
  await Promise.all(
    pending.map(async (fig) => {
      try {
        const caption = await describer.describe({
          ref: fig.ref,
          page: fig.page,
          bbox: fig.bbox,
          ...(fig.mime ? { mime: fig.mime } : {}),
          ...(fig.bytes ? { bytes: fig.bytes } : {}),
        });
        if (caption) fig.alt = caption.replace(/\s+/g, " ").trim();
      } catch {
        // Non-fatal: leave the figure undescribed.
      }
    }),
  );
}

/**
 * Parse a document into Markdown, structured JSON, page blocks and RAG chunks.
 *
 * @example
 * const doc = await parseDocument(new Uint8Array(bytes));
 * console.log(doc.markdown);
 */
export async function parseDocument(
  input: DocumentInput,
  options: ParseOptions = {},
): Promise<ParsedDocument> {
  if (options.mode === "boost") {
    throw new Error(
      "mode: 'boost' requires an enterprise refiner (e.g. @docmarrow/vlm-boost), which is not " +
        "part of the open-source core. Use mode: 'fast' (default) or plug in a refiner.",
    );
  }

  const bytes = toUint8(input);
  const format = options.format ?? detectFormat(bytes);

  // Each backend yields a common shape: blocks, an optional embedded title, and
  // warnings. From there, serialization, JSON, chunking and meta are identical.
  let blocks: Block[];
  let pageBlocks: Block[][];
  let embeddedTitle: string | undefined;
  let warnings: string[];
  let pageCount: number;

  if (format === "pdf") {
    const extraction = await extractPdf(bytes, {
      ...(options.password ? { password: options.password } : {}),
    });

    // Optional OCR: fill pages that yielded no text (scanned/image-only).
    if (options.ocr) {
      const emptyPages = extraction.pages
        .map((p, i) => (p.items.length === 0 ? i + 1 : 0))
        .filter((n) => n > 0);
      if (emptyPages.length > 0) {
        const ocrItems = await options.ocr.ocrPages(bytes, emptyPages);
        for (const [pageNumber, items] of ocrItems) {
          const page = extraction.pages[pageNumber - 1];
          if (page && items.length > 0) page.items = items;
        }
      }
    }

    const analyzed = analyze(extraction.pages, options);
    blocks = analyzed.blocks;
    pageBlocks = analyzed.pages;
    warnings = analyzed.warnings;
    embeddedTitle = extraction.title;
    pageCount = extraction.pages.length;
  } else {
    // Flow formats (DOCX/XLSX/PPTX/HTML): each backend returns the same shape
    // ({ blocks, title?, warnings }) and maps to a single logical page.
    const analyzed =
      format === "docx"
        ? analyzeDocx(bytes)
        : format === "xlsx"
          ? analyzeXlsx(bytes)
          : format === "pptx"
            ? analyzePptx(bytes)
            : analyzeHtml(bytes);
    blocks = analyzed.blocks;
    pageBlocks = [blocks];
    warnings = analyzed.warnings;
    embeddedTitle = analyzed.title;
    pageCount = 1;
  }

  // Optional figure captioning: fill alt text on figures that have none. Mutates
  // the shared block objects, so Markdown/JSON/chunks (built below) all see it.
  if (options.describeImage) {
    await describeFigures(blocks, options.describeImage);
  }

  // Prefer the embedded title; fall back to the first level-1 heading.
  const firstH1 = blocks.find((b) => b.type === "heading" && b.level === 1);
  const resolvedTitle =
    embeddedTitle ?? (firstH1 && "text" in firstH1 ? firstH1.text : undefined);

  const meta: DocumentMeta = {
    format,
    pageCount,
    hasText: blocks.length > 0,
    ...(resolvedTitle ? { title: resolvedTitle } : {}),
    warnings,
  };

  return {
    markdown: toMarkdown(blocks),
    blocks,
    json: toContentTree(blocks),
    pages: pageBlocks,
    meta,
    chunks: (chunkOptions?: ChunkOptions) => chunkBlocks(blocks, chunkOptions),
  };
}

export type {
  AnalyzeOptions,
  Block,
  Chunk,
  ChunkOptions,
  ContentNode,
  DocumentMeta,
  FigureBlock,
  FigureImage,
  ImageDescriber,
  OcrEngine,
} from "@docmarrow/core";
