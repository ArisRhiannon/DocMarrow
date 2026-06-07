/**
 * Core data model for docmarrow.
 *
 * Coordinate convention (used everywhere downstream of a backend):
 *   - Origin is the TOP-LEFT of the page.
 *   - `x` increases to the right, `y` increases downward.
 *   - All values are in PDF points (1/72 inch). Backends are responsible for
 *     converting their native coordinates into this convention.
 */

/** A single positioned run of text emitted by a backend. */
export interface TextItem {
  text: string;
  /** Left edge, points from page left. */
  x: number;
  /** Top edge of the glyph box, points from page top. */
  y: number;
  /** Advance width of the run, in points. */
  width: number;
  /** Glyph box height (≈ font size), in points. */
  height: number;
  /** Nominal font size in points. */
  fontSize: number;
  /** Raw backend font identifier, if available. */
  fontName?: string;
  /** True when the backend could determine the run is bold. */
  bold?: boolean;
  /** True when the backend could determine the run is italic. */
  italic?: boolean;
  /** True when the backend could determine the run uses a monospace font. */
  mono?: boolean;
}

/**
 * An axis-aligned vector rule (table border line) extracted from a page's
 * graphics, in the top-left point convention. Horizontal rules have
 * `y0 === y1`; vertical rules have `x0 === x1`.
 */
export interface Rule {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * A figure located by a backend on a page, before the pipeline turns it into a
 * {@link FigureBlock} (adding page index and confidence). Positioned in the
 * top-left point convention so it can be woven into reading order.
 */
export interface FigureRef {
  bbox: BBox;
  /** See {@link FigureBlock.ref}. */
  ref: string;
  /** Alt text from the source, if any. */
  alt?: string;
  mime?: string;
  /** Raw image bytes when cheaply available; see {@link FigureBlock.bytes}. */
  bytes?: Uint8Array;
}

/** One page of extracted content, as produced by a backend. */
export interface PageInput {
  /** Page width in points. */
  width: number;
  /** Page height in points. */
  height: number;
  items: TextItem[];
  /**
   * Vector rules (table border lines) for the page, if the backend extracts
   * them. Used to reconstruct ruled tables; absent for flow formats.
   */
  rules?: Rule[];
  /**
   * Embedded figures/images located on the page, if the backend extracts them.
   * Woven into the block stream by vertical position during analysis.
   */
  figures?: FigureRef[];
}

/** Axis-aligned bounding box, top-left origin. */
export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BlockType =
  | "heading"
  | "paragraph"
  | "list"
  | "table"
  | "code"
  | "quote"
  | "figure";

interface BlockBase {
  type: BlockType;
  /** 1-based page index this block originates from. */
  page: number;
  bbox: BBox;
  /** Heuristic confidence in [0, 1]. */
  confidence: number;
}

export interface HeadingBlock extends BlockBase {
  type: "heading";
  level: 1 | 2 | 3 | 4;
  text: string;
}

export interface ParagraphBlock extends BlockBase {
  type: "paragraph";
  text: string;
}

export interface ListItemNode {
  text: string;
  /** Indentation depth, 0 = top level. */
  level: number;
}

export interface ListBlock extends BlockBase {
  type: "list";
  ordered: boolean;
  items: ListItemNode[];
}

export interface TableBlock extends BlockBase {
  type: "table";
  /** Row-major cells. The first row is treated as the header by serializers. */
  rows: string[][];
}

export interface CodeBlock extends BlockBase {
  type: "code";
  text: string;
}

export interface QuoteBlock extends BlockBase {
  type: "quote";
  text: string;
}

/**
 * An embedded image / figure (chart, diagram, screenshot, photo). Backends
 * locate figures and pass through whatever the source gives; understanding the
 * pixels is delegated to an optional {@link ImageDescriber} (e.g. a vision LLM).
 */
export interface FigureBlock extends BlockBase {
  type: "figure";
  /**
   * Alt text / caption. Taken from the source when available (HTML `alt`, OOXML
   * `descr`), or filled by an injected {@link ImageDescriber}; `""` when neither
   * is available. This is what makes a figure searchable in Markdown and chunks.
   */
  alt: string;
  /**
   * Short, human-readable locator for the image: an HTML `src`, the zip media
   * path for DOCX/PPTX (`word/media/image1.png`), or a synthesized id for a PDF
   * image XObject (`p2-img1`). Never raw base64 — kept small for clean Markdown.
   */
  ref: string;
  /** MIME type when known (e.g. `"image/png"`). */
  mime?: string;
  /**
   * Raw image bytes when cheaply available (zip media, `data:` URIs). Absent for
   * PDF image XObjects (rasterizing them needs a canvas — opt-in, like OCR) and
   * for remote HTML `src`s.
   */
  bytes?: Uint8Array;
}

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | TableBlock
  | CodeBlock
  | QuoteBlock
  | FigureBlock;

/**
 * A pluggable OCR engine. Implementations live in optional packages (e.g.
 * `@docmarrow/ocr`, which wraps tesseract.js) so the core stays pure JS with no
 * heavy/native dependencies. When supplied to `parseDocument`, PDF pages that
 * yield no extractable text (scanned/image-only) are rasterized and OCR'd, and
 * the recognized words are fed into the normal layout pipeline.
 */
export interface OcrEngine {
  /**
   * OCR the given 1-based pages of a PDF, returning positioned text items in
   * the top-left point convention, keyed by page number. Pages omitted from the
   * result are left untouched.
   */
  ocrPages(pdf: Uint8Array, pageNumbers: number[]): Promise<Map<number, TextItem[]>>;
}

/** A figure handed to an {@link ImageDescriber}. */
export interface FigureImage {
  /** The figure's locator (see {@link FigureBlock.ref}). */
  ref: string;
  /** 1-based page the figure is on. */
  page: number;
  bbox: BBox;
  mime?: string;
  /** Image bytes when available; absent for PDF XObjects and remote `src`s. */
  bytes?: Uint8Array;
}

/**
 * A pluggable image/figure describer. Implementations live in user code or
 * optional packages (e.g. a vision-LLM caption service), mirroring
 * {@link OcrEngine} so the core stays dependency-free. When supplied to
 * `parseDocument`, every extracted figure with no alt text is described and the
 * caption is written into the figure's `alt` (so it serializes into Markdown
 * and feeds the chunker). Figures that already carry source alt text are left
 * untouched.
 */
export interface ImageDescriber {
  /** Return a short caption/description for the figure, or `""` to skip it. */
  describe(image: FigureImage): Promise<string>;
}

/** Options controlling the analysis pipeline. */
export interface AnalyzeOptions {
  /** Reconstruct multi-column reading order. Default: true. */
  readingOrder?: boolean;
  /** Detect and emit tables. Default: true. */
  tables?: boolean;
  /** Remove repeated page headers/footers and bare page numbers. Default: true. */
  dropHeadersFooters?: boolean;
}

/** A chunk produced for RAG ingestion. */
export interface Chunk {
  text: string;
  /** Estimated token count (see {@link estimateTokens}). */
  tokens: number;
  /** Pages this chunk spans (1-based, ascending). */
  pages: number[];
  /** Heading breadcrumb leading to this chunk, e.g. ["Intro", "Goals"]. */
  path: string[];
  bbox: BBox;
}

export interface ChunkOptions {
  /** Soft upper bound on tokens per chunk. Default: 512. */
  maxTokens?: number;
  /** Token overlap carried between consecutive chunks. Default: 64. */
  overlap?: number;
  /**
   * Token counter used for boundaries and reported counts. Defaults to a
   * dependency-free word heuristic ({@link Chunk.tokens}); pass a real model
   * tokenizer (e.g. `js-tiktoken`'s `encode(t).length`) for exact counts.
   */
  countTokens?: (text: string) => number;
}

/** Result of analysing a document. */
export interface AnalysisResult {
  blocks: Block[];
  /** Blocks grouped by 1-based page index. */
  pages: Block[][];
  /**
   * Non-fatal warnings raised during analysis (e.g. a page with no extractable
   * text, which usually means it is scanned/image-only and would need OCR).
   */
  warnings: string[];
}

/** High-level metadata about a parsed document. */
export interface DocumentMeta {
  /** Source format the bytes were parsed as. */
  format: "pdf" | "docx" | "xlsx" | "pptx" | "html";
  /** Number of pages (PDF) or `1` for flow formats (DOCX/XLSX/PPTX/HTML). */
  pageCount: number;
  /**
   * True when at least one page yielded extractable text. `false` is the
   * signal for a fully scanned/image-only PDF (no OCR is performed).
   */
  hasText: boolean;
  /** Document title, from embedded metadata when available. */
  title?: string;
  /** Non-fatal warnings surfaced during parsing. */
  warnings: string[];
}
