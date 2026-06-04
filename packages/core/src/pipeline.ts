import { boundingBox, groupLines, type Line, median } from "./layout.js";
import { dropRunningHeadFoot, segmentPage } from "./reading-order.js";
import { structureLines } from "./structure.js";
import { detectTables, type DetectedTable } from "./tables.js";
import type { AnalysisResult, AnalyzeOptions, Block, PageInput } from "./types.js";

/**
 * Analyse extracted page content into structured blocks.
 *
 * This is the deterministic, rule-based `fast` pipeline: reading order (item
 * segmentation + column detection) → running header/footer removal → table
 * detection → structure detection (headings/lists/paragraphs).
 */
export function analyze(pages: PageInput[], options: AnalyzeOptions = {}): AnalysisResult {
  const readingOrder = options.readingOrder ?? true;
  const tablesEnabled = options.tables ?? true;
  const dropHF = options.dropHeadersFooters ?? true;

  const perPageLines: Line[][] = pages.map((p) =>
    readingOrder
      ? segmentPage(p.items, p.width)
      : groupLines(p.items).sort((a, b) => a.y - b.y || a.x - b.x),
  );

  const filtered = dropHF
    ? dropRunningHeadFoot(perPageLines.map((lines, i) => ({ lines, height: pages[i]!.height })))
    : perPageLines;

  const allFonts = filtered.flatMap((lines) => lines.map((l) => l.fontSize));
  const bodyFont = median(allFonts) || 12;

  const pageBlocks: Block[][] = filtered.map((ordered, pi) => {
    const page = pi + 1;
    const leftMargin = ordered.length ? Math.min(...ordered.map((l) => l.x)) : 0;

    const tableStarts = new Map<Line, DetectedTable>();
    const consumed = new Set<Line>();
    if (tablesEnabled) {
      const { tables } = detectTables(ordered);
      for (const t of tables) {
        tableStarts.set(t.lines[0]!, t);
        for (const l of t.lines) consumed.add(l);
      }
    }

    const blocks: Block[] = [];
    let buffer: Line[] = [];
    const flush = (): void => {
      if (buffer.length) {
        blocks.push(...structureLines(buffer, page, bodyFont, leftMargin));
        buffer = [];
      }
    };

    for (const line of ordered) {
      const table = tableStarts.get(line);
      if (table) {
        flush();
        blocks.push({
          type: "table",
          rows: table.rows,
          page,
          bbox: boundingBox(table.lines),
          confidence: 0.6,
        });
        continue;
      }
      if (consumed.has(line)) continue;
      buffer.push(line);
    }
    flush();
    return blocks;
  });

  return { blocks: pageBlocks.flat(), pages: pageBlocks };
}
