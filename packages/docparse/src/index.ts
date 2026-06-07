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
} from "@docparse/core";
import { extractPdf } from "@docparse/pdf";
import { analyzeDocx } from "@docparse/docx";

export type DocumentInput = Uint8Array | ArrayBuffer | ArrayBufferView;

export interface ParseOptions extends AnalyzeOptions {
  /** Input format. Autodetected from the file signature when omitted. */
  format?: "pdf" | "docx";
  /**
   * "fast" = deterministic rule-based pipeline (default).
   * "boost" requires an enterprise refiner module and is not bundled in core.
   */
  mode?: "fast" | "boost";
  /** Password for encrypted PDFs. */
  password?: string;
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

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04 (DOCX is a zip)

function detectFormat(bytes: Uint8Array): "pdf" | "docx" {
  if (PDF_MAGIC.every((b, i) => bytes[i] === b)) return "pdf";
  // DOCX (and other OOXML) are zip containers. We route any zip to the DOCX
  // backend, which validates the OOXML parts and throws a clear error if the
  // archive is not actually a Word document.
  if (ZIP_MAGIC.every((b, i) => bytes[i] === b)) return "docx";
  throw new Error(
    "Unrecognised input: expected a PDF (%PDF header) or a DOCX/OOXML zip (PK header). " +
      "Scanned-image inputs and other formats are not supported.",
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
      "mode: 'boost' requires an enterprise refiner (e.g. @docparse/vlm-boost), which is not " +
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
    const analyzed = analyze(extraction.pages, options);
    blocks = analyzed.blocks;
    pageBlocks = analyzed.pages;
    warnings = analyzed.warnings;
    embeddedTitle = extraction.title;
    pageCount = extraction.pages.length;
  } else {
    const analyzed = analyzeDocx(bytes);
    blocks = analyzed.blocks;
    pageBlocks = [blocks]; // flow format: a single logical page
    warnings = analyzed.warnings;
    embeddedTitle = analyzed.title;
    pageCount = 1;
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
} from "@docparse/core";
