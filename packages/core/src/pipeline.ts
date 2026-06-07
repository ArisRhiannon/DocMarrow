import { boundingBox, groupLines, type Line, median } from "./layout.js";
import { dropRunningHeadFoot, segmentPage } from "./reading-order.js";
import { structureLines } from "./structure.js";
import { detectTables, type DetectedTable } from "./tables.js";
import { detectRuledTables } from "./ruled-tables.js";
import type {
  AnalysisResult,
  AnalyzeOptions,
  BBox,
  Block,
  FigureBlock,
  FigureRef,
  PageInput,
} from "./types.js";

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

  // Surface pages that yielded no text — almost always scanned/image-only pages
  // that would require OCR (which this pipeline deliberately does not do).
  const warnings: string[] = [];
  perPageLines.forEach((lines, i) => {
    if (lines.length === 0) {
      warnings.push(
        `Page ${i + 1} has no extractable text (likely scanned or image-only; OCR is not performed).`,
      );
    }
  });

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
      // Prefer ruled (vector-line) tables; run the geometric detector only on
      // the lines the ruled grids did not already claim, so both can coexist.
      const pageRules = pages[pi]!.rules ?? [];
      const ruled = pageRules.length
        ? detectRuledTables(ordered, pageRules)
        : { tables: [] as DetectedTable[], consumed: new Set<Line>() };
      const remaining = ruled.consumed.size
        ? ordered.filter((l) => !ruled.consumed.has(l))
        : ordered;
      const geom = detectTables(remaining);
      for (const t of [...ruled.tables, ...geom.tables]) {
        if (!t.lines.length) continue;
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
    const figures = pages[pi]!.figures ?? [];
    return figures.length ? weaveFigures(blocks, figures, page) : blocks;
  });

  return { blocks: pageBlocks.flat(), pages: pageBlocks, warnings };
}

const centerY = (b: BBox): number => b.y + b.height / 2;

/**
 * Insert backend-located figures into a page's already reading-ordered blocks
 * by vertical position: each figure lands before the first block whose vertical
 * centre is below it (else at the end). Heuristic, but keeps text order intact.
 */
function weaveFigures(blocks: Block[], figures: FigureRef[], page: number): Block[] {
  const result = [...blocks];
  const sorted = [...figures].sort((a, b) => centerY(a.bbox) - centerY(b.bbox));
  for (const f of sorted) {
    const fb: FigureBlock = {
      type: "figure",
      alt: f.alt ?? "",
      ref: f.ref,
      ...(f.mime ? { mime: f.mime } : {}),
      ...(f.bytes ? { bytes: f.bytes } : {}),
      page,
      bbox: f.bbox,
      confidence: 0.9,
    };
    const fy = centerY(f.bbox);
    let idx = result.findIndex((b) => centerY(b.bbox) > fy);
    if (idx < 0) idx = result.length;
    result.splice(idx, 0, fb);
  }
  return result;
}
