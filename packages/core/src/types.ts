/**
 * Core data model for docparse.
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
}

/** One page of extracted content, as produced by a backend. */
export interface PageInput {
  /** Page width in points. */
  width: number;
  /** Page height in points. */
  height: number;
  items: TextItem[];
}

/** Axis-aligned bounding box, top-left origin. */
export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BlockType = "heading" | "paragraph" | "list" | "table" | "code" | "quote";

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

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | TableBlock
  | CodeBlock
  | QuoteBlock;

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
}

/** Result of analysing a document. */
export interface AnalysisResult {
  blocks: Block[];
  /** Blocks grouped by 1-based page index. */
  pages: Block[][];
}
