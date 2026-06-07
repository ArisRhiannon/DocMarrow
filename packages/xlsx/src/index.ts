import type { Block } from "@docmarrow/core";
import {
  attr,
  childrenNamed,
  childrenOf,
  collectAllText,
  deepFirst,
  firstChild,
  parseXml,
  readXmlParts,
  textOf,
  type XmlNode,
} from "@docmarrow/ooxml";

const ZERO_BBOX = { x: 0, y: 0, width: 0, height: 0 } as const;
const XLSX_CONFIDENCE = 0.95;

export interface XlsxAnalysis {
  blocks: Block[];
  title?: string;
  warnings: string[];
}

/** Parse an A1 reference like "B12" into zero-based { col, row }. */
function parseRef(ref: string): { col: number; row: number } | null {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]!.toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: Number(m[2]) - 1 };
}

/** Shared string table: each <si> is the concatenation of its <t> runs. */
function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const sst = deepFirst(parseXml(xml), "sst");
  if (!sst) return [];
  return childrenNamed(sst, "si").map((si) => collectAllText(si).trim());
}

/** Resolve a cell's display text from its type and value. */
function cellText(cell: XmlNode, shared: string[]): string {
  const type = attr(cell, "t");
  if (type === "inlineStr") {
    const is = firstChild(cell, "is");
    return is ? collectAllText(is).trim() : "";
  }
  const v = firstChild(cell, "v");
  const raw = v ? collectAllText(v).trim() : "";
  if (raw === "") return "";
  if (type === "s") {
    const idx = Number(raw);
    return Number.isInteger(idx) ? (shared[idx] ?? "") : "";
  }
  if (type === "b") return raw === "1" ? "TRUE" : "FALSE";
  // "str" (formula result), numbers, dates: use the stored value as-is.
  return raw;
}

/** Build a compact row-major grid (trimmed to the used range) for one sheet. */
function sheetGrid(xml: string, shared: string[]): string[][] {
  const ws = deepFirst(parseXml(xml), "worksheet");
  const sheetData = ws ? firstChild(ws, "sheetData") : undefined;
  if (!sheetData) return [];

  const cells: Array<{ col: number; row: number; text: string }> = [];
  childrenNamed(sheetData, "row").forEach((row, rowOrder) => {
    const declaredRow = Number(attr(row, "r"));
    const rowIndex = Number.isFinite(declaredRow) && declaredRow > 0 ? declaredRow - 1 : rowOrder;
    childrenNamed(row, "c").forEach((c, colOrder) => {
      const ref = attr(c, "r");
      const pos = ref ? parseRef(ref) : null;
      const col = pos ? pos.col : colOrder;
      const r = pos ? pos.row : rowIndex;
      const text = cellText(c, shared);
      if (text !== "") cells.push({ col, row: r, text });
    });
  });
  if (cells.length === 0) return [];

  const minRow = Math.min(...cells.map((c) => c.row));
  const maxRow = Math.max(...cells.map((c) => c.row));
  const minCol = Math.min(...cells.map((c) => c.col));
  const maxCol = Math.max(...cells.map((c) => c.col));
  const grid: string[][] = Array.from({ length: maxRow - minRow + 1 }, () =>
    new Array<string>(maxCol - minCol + 1).fill(""),
  );
  for (const cell of cells) grid[cell.row - minRow]![cell.col - minCol] = cell.text;
  return grid;
}

interface SheetRef {
  name: string;
  path: string;
}

/** Resolve sheet name -> worksheet part path via workbook.xml + its rels. */
function resolveSheets(parts: Map<string, string>): SheetRef[] {
  const wbXml = parts.get("xl/workbook.xml");
  const relsXml = parts.get("xl/_rels/workbook.xml.rels");
  if (!wbXml) return [];

  const ridToTarget = new Map<string, string>();
  if (relsXml) {
    const rels = deepFirst(parseXml(relsXml), "Relationships");
    for (const rel of rels ? childrenNamed(rels, "Relationship") : []) {
      const id = attr(rel, "Id");
      const target = attr(rel, "Target");
      if (id && target) ridToTarget.set(id, target);
    }
  }

  const resolvePath = (target: string): string => {
    const clean = target.replace(/^\//, "");
    return clean.startsWith("xl/") ? clean : `xl/${clean}`;
  };

  const wb = deepFirst(parseXml(wbXml), "workbook");
  const sheetsEl = wb ? firstChild(wb, "sheets") : undefined;
  const out: SheetRef[] = [];
  let fallback = 1;
  for (const sheet of sheetsEl ? childrenNamed(sheetsEl, "sheet") : []) {
    const name = attr(sheet, "name") ?? `Sheet${fallback}`;
    const rid = attr(sheet, "r:id") ?? attr(sheet, "id");
    const target = rid ? ridToTarget.get(rid) : undefined;
    out.push({ name, path: target ? resolvePath(target) : `xl/worksheets/sheet${fallback}.xml` });
    fallback++;
  }
  return out;
}

function coreTitle(xml: string | undefined): string | undefined {
  if (!xml) return undefined;
  const title = deepFirst(parseXml(xml), "dc:title");
  if (!title) return undefined;
  const text = childrenOf(title)
    .map((c) => textOf(c) ?? "")
    .join("")
    .trim();
  return text || undefined;
}

/**
 * Parse XLSX (OOXML spreadsheet) bytes into core blocks: each non-empty sheet
 * becomes a level-2 heading (the sheet name) followed by a table of its used
 * cell range. Pure JS — no native dependencies.
 */
export function analyzeXlsx(bytes: Uint8Array): XlsxAnalysis {
  let parts: Map<string, string>;
  try {
    parts = readXmlParts(bytes);
  } catch (err) {
    throw new Error(
      `Not a valid XLSX (failed to read the OOXML zip container): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  if (!parts.has("xl/workbook.xml")) {
    throw new Error("Not a valid XLSX: the archive has no xl/workbook.xml part.");
  }

  const shared = parseSharedStrings(parts.get("xl/sharedStrings.xml"));
  const sheets = resolveSheets(parts);

  const blocks: Block[] = [];
  for (const sheet of sheets) {
    const xml = parts.get(sheet.path);
    if (!xml) continue;
    const grid = sheetGrid(xml, shared);
    if (grid.length === 0) continue;
    blocks.push({
      type: "heading",
      level: 2,
      text: sheet.name,
      page: 1,
      bbox: { ...ZERO_BBOX },
      confidence: XLSX_CONFIDENCE,
    });
    blocks.push({
      type: "table",
      rows: grid,
      page: 1,
      bbox: { ...ZERO_BBOX },
      confidence: XLSX_CONFIDENCE,
    });
  }

  const title = coreTitle(parts.get("docProps/core.xml"));
  const warnings: string[] = [];
  if (blocks.length === 0) warnings.push("The XLSX workbook contained no non-empty cells.");
  return { blocks, ...(title ? { title } : {}), warnings };
}
