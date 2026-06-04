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
} from "@docparse/core";
import { extractPdf } from "@docparse/pdf";

export type DocumentInput = Uint8Array | ArrayBuffer | ArrayBufferView;

export interface ParseOptions extends AnalyzeOptions {
  /** Input format. Only "pdf" is supported in v0.1; autodetected when omitted. */
  format?: "pdf";
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
  /** Structure-aware chunking for RAG. */
  chunks(options?: ChunkOptions): Chunk[];
}

function toUint8(input: DocumentInput): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

function detectFormat(bytes: Uint8Array): "pdf" {
  if (PDF_MAGIC.every((b, i) => bytes[i] === b)) return "pdf";
  throw new Error(
    "docparse v0.1 supports digital PDFs only. The input does not start with the %PDF header. " +
      "DOCX/PPTX/XLSX backends are planned for v0.2.",
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
  if (format !== "pdf") {
    throw new Error(`Unsupported format: ${format}`);
  }

  const pages = await extractPdf(bytes, { ...(options.password ? { password: options.password } : {}) });
  const { blocks, pages: pageBlocks } = analyze(pages, options);

  return {
    markdown: toMarkdown(blocks),
    blocks,
    json: toContentTree(blocks),
    pages: pageBlocks,
    chunks: (chunkOptions?: ChunkOptions) => chunkBlocks(blocks, chunkOptions),
  };
}

export type {
  AnalyzeOptions,
  Block,
  Chunk,
  ChunkOptions,
  ContentNode,
} from "@docparse/core";
