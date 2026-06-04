import { groupLines, type Line } from "./layout.js";
import type { TextItem } from "./types.js";

/** Minimal positioned box used for column geometry. */
export interface Box {
  x: number;
  width: number;
}

/** A detected column as an inclusive x-range, in points. */
export interface Column {
  x0: number;
  x1: number;
}

/**
 * Detect columns via vertical whitespace gutters in the x-projection of boxes.
 *
 * Boxes wider than 60% of the page (titles, rules, full-width prose) are
 * excluded so they do not fill the gutter between body columns. A gutter
 * qualifies when it is empty across the full page height, wide enough (~3.5% of
 * page width), and bordered by content on both sides. Returns a single column
 * when no real gutter is found.
 */
export function detectColumns(boxes: Box[], pageWidth: number, bins = 120): Column[] {
  const single: Column[] = [{ x0: 0, x1: pageWidth }];
  const body = boxes.filter((b) => b.width < pageWidth * 0.6);
  if (body.length < 4) return single;

  const binW = pageWidth / bins;
  const covered = new Array<boolean>(bins).fill(false);
  for (const b of body) {
    const start = Math.max(0, Math.floor(b.x / binW));
    const end = Math.min(bins - 1, Math.floor((b.x + b.width) / binW));
    for (let i = start; i <= end; i++) covered[i] = true;
  }

  const minGutterBins = Math.max(1, Math.round((pageWidth * 0.035) / binW));
  const gutters: Array<[number, number]> = [];
  let runStart = -1;
  for (let b = 0; b < bins; b++) {
    if (!covered[b]) {
      if (runStart < 0) runStart = b;
    } else if (runStart >= 0) {
      gutters.push([runStart, b - 1]);
      runStart = -1;
    }
  }
  if (runStart >= 0) gutters.push([runStart, bins - 1]);

  const interior = gutters.filter(
    ([s, e]) => s > 0 && e < bins - 1 && e - s + 1 >= minGutterBins,
  );
  if (interior.length === 0) return single;

  const cols: Column[] = [];
  let cursor = 0;
  for (const [s, e] of interior) {
    cols.push({ x0: cursor * binW, x1: s * binW });
    cursor = e + 1;
  }
  cols.push({ x0: cursor * binW, x1: pageWidth });
  return cols.filter((c) => c.x1 - c.x0 > binW);
}

const centerX = (b: Box): number => b.x + b.width / 2;

/** Index of the column whose range is nearest the box center. */
function assignColumn(b: Box, columns: Column[]): number {
  const c = centerX(b);
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]!;
    const dist = c < col.x0 ? col.x0 - c : c > col.x1 ? c - col.x1 : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

const midY = (it: TextItem): number => it.y + it.height / 2;

/**
 * Decide whether candidate columns are real text columns or an aligned grid.
 *
 * In a table/grid, most baselines carry cells in two or more candidate columns
 * (rows cross the gutter). In genuine multi-column prose, columns wrap
 * independently so cross-gutter baselines are rare. Returns true when the layout
 * looks like prose columns.
 */
function looksLikeColumns(body: TextItem[], columns: Column[]): boolean {
  const baselines = new Map<number, Set<number>>();
  for (const it of body) {
    const key = Math.round(midY(it) / 4);
    const set = baselines.get(key) ?? baselines.set(key, new Set()).get(key)!;
    set.add(assignColumn(it, columns));
  }
  const buckets = [...baselines.values()];
  if (buckets.length === 0) return false;
  const crossing = buckets.filter((s) => s.size >= 2).length;
  return crossing / buckets.length <= 0.5;
}

/**
 * Segment a page's text items into lines in reading order.
 *
 * Pipeline: split off full-width spanning items → detect columns on the body →
 * disambiguate columns vs. grid → group lines per column → reassemble in
 * reading order, with spanning lines (titles/footers) splitting the page into
 * horizontal bands so they land between, not inside, the columns.
 */
export function segmentPage(items: TextItem[], pageWidth: number): Line[] {
  const visible = items.filter((it) => it.text.trim().length > 0);
  const spanThreshold = pageWidth * 0.55;
  const spanning = visible.filter((it) => it.width >= spanThreshold);
  const body = visible.filter((it) => it.width < spanThreshold);

  let columns = detectColumns(body, pageWidth);
  if (columns.length >= 2 && !looksLikeColumns(body, columns)) {
    columns = [{ x0: 0, x1: pageWidth }];
  }

  if (columns.length <= 1) {
    return groupLines(visible).sort((a, b) => a.y - b.y || a.x - b.x);
  }

  const colItems: TextItem[][] = columns.map(() => []);
  for (const it of body) colItems[assignColumn(it, columns)]!.push(it);
  const colLines = colItems.map((its) => groupLines(its));
  const spanningLines = groupLines(spanning).sort((a, b) => a.y - b.y);

  const result: Line[] = [];
  const band = (lo: number, hi: number): void => {
    for (const lines of colLines) {
      result.push(...lines.filter((l) => l.y >= lo && l.y < hi).sort((a, b) => a.y - b.y));
    }
  };

  let prevY = -Infinity;
  for (const span of spanningLines) {
    band(prevY, span.y);
    result.push(span);
    prevY = span.y;
  }
  band(prevY, Infinity);
  return result;
}

/** Normalise margin text for cross-page comparison (drop digits/punctuation). */
function runningKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/\d+/g, "#")
    .replace(/[^a-z#]+/g, " ")
    .trim();
}

const PAGE_NUMBER = /^[\s\-–—|.]*(?:page\s*)?\d+(?:\s*\/\s*\d+)?[\s\-–—|.]*$/i;

/**
 * Remove running headers/footers and bare page numbers.
 *
 * A margin line (top/bottom 10% of the page) is dropped when its normalised
 * text repeats in the margin of at least half the pages (min 2), or when it is
 * a bare page number. Returns filtered lines per page; order is preserved.
 */
export function dropRunningHeadFoot(pages: Array<{ lines: Line[]; height: number }>): Line[][] {
  const marginFrac = 0.1;
  const inMargin = (l: Line, h: number): boolean =>
    l.y < h * marginFrac || l.y + l.height > h * (1 - marginFrac);

  const keyPages = new Map<string, Set<number>>();
  pages.forEach((p, pi) => {
    for (const l of p.lines) {
      if (!inMargin(l, p.height)) continue;
      const key = runningKey(l.text);
      if (key.length < 3) continue;
      (keyPages.get(key) ?? keyPages.set(key, new Set()).get(key)!).add(pi);
    }
  });

  const threshold = Math.max(2, Math.ceil(pages.length / 2));
  const repeated = new Set(
    [...keyPages.entries()].filter(([, set]) => set.size >= threshold).map(([k]) => k),
  );

  return pages.map((p) =>
    p.lines.filter((l) => {
      if (!inMargin(l, p.height)) return true;
      if (PAGE_NUMBER.test(l.text)) return false;
      return !repeated.has(runningKey(l.text));
    }),
  );
}
