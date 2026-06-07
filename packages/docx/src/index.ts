import type { Block } from "@docmarrow/core";
import { coreTitle, documentToBlocks } from "./ooxml.js";
import { readDocxParts } from "./unzip.js";

/** Result of analysing a DOCX document into core blocks. */
export interface DocxAnalysis {
  /** Structured blocks in document order (page is always 1 for flow formats). */
  blocks: Block[];
  /** Document title from `docProps/core.xml`, when present. */
  title?: string;
  /** Non-fatal warnings surfaced during parsing. */
  warnings: string[];
}

/**
 * Parse DOCX (OOXML) bytes into docmarrow's core block model.
 *
 * Unlike the PDF path, DOCX carries explicit structure (heading/quote/code
 * styles, list numbering, real tables), so blocks are produced directly without
 * geometric layout analysis. Pure JS (fflate + fast-xml-parser) — runs in Node,
 * browsers and edge runtimes.
 *
 * @throws if the bytes are not a valid DOCX container.
 */
export function analyzeDocx(bytes: Uint8Array): DocxAnalysis {
  const parts = readDocxParts(bytes);
  const blocks = documentToBlocks(parts.document, parts.styles, parts.numbering);
  const title = coreTitle(parts.core);

  const warnings: string[] = [];
  if (blocks.length === 0) {
    warnings.push("The DOCX body contained no extractable text.");
  }

  return { blocks, ...(title ? { title } : {}), warnings };
}

export { readDocxParts } from "./unzip.js";
