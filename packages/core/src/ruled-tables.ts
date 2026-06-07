import type { Line } from "./layout.js";
import type { DetectedTable } from "./tables.js";
import type { Rule } from "./types.js";

/**
 * Ruled-table detection from vector rules.
 *
 * Unlike the geometric detector (which infers structure from whitespace
 * alignment), this uses the actual border lines a PDF draws. Rules are grouped
 * into connected grids (union-find over crossing rules); each grid with at least
 * 2 rows and 2 columns of rules becomes a table, and text lines are dropped into
 * cells by their center. Merged/spanning cells are approximated: a value lands
 * in the single cell its center falls in (neighbouring spanned cells stay empty).
 */

interface OrientedRule {
  horizontal: boolean;
  /** For horizontal: the y; for vertical: the x. */
  pos: number;
  /** Span along the rule (x-range for horizontal, y-range for vertical). */
  lo: number;
  hi: number;
}

function orient(r: Rule): OrientedRule {
  const horizontal = Math.abs(r.y1 - r.y0) <= Math.abs(r.x1 - r.x0);
  return horizontal
    ? { horizontal, pos: (r.y0 + r.y1) / 2, lo: Math.min(r.x0, r.x1), hi: Math.max(r.x0, r.x1) }
    : { horizontal, pos: (r.x0 + r.x1) / 2, lo: Math.min(r.y0, r.y1), hi: Math.max(r.y0, r.y1) };
}

/** Do a horizontal and a vertical rule cross (within tolerance)? */
function crosses(h: OrientedRule, v: OrientedRule, tol: number): boolean {
  return (
    v.pos >= h.lo - tol &&
    v.pos <= h.hi + tol &&
    h.pos >= v.lo - tol &&
    h.pos <= v.hi + tol
  );
}

class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]!]!;
      i = this.parent[i]!;
    }
    return i;
  }
  union(a: number, b: number): void {
    this.parent[this.find(a)] = this.find(b);
  }
}

/** Collapse near-equal positions into sorted cluster centers. */
function clusterPositions(values: number[], tol: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const centers: number[] = [];
  let bucket: number[] = [];
  for (const v of sorted) {
    if (bucket.length && v - bucket[bucket.length - 1]! > tol) {
      centers.push(bucket.reduce((s, x) => s + x, 0) / bucket.length);
      bucket = [];
    }
    bucket.push(v);
  }
  if (bucket.length) centers.push(bucket.reduce((s, x) => s + x, 0) / bucket.length);
  return centers;
}

const lineCenter = (l: Line): { cx: number; cy: number } => ({
  cx: l.x + l.width / 2,
  cy: l.y + l.height / 2,
});

/** Index of the band [bounds[i], bounds[i+1]) containing `v`, or -1. */
function bandIndex(bounds: number[], v: number, tol: number): number {
  for (let i = 0; i < bounds.length - 1; i++) {
    if (v >= bounds[i]! - tol && v < bounds[i + 1]! + tol) return i;
  }
  return -1;
}

export function detectRuledTables(
  lines: Line[],
  rules: Rule[],
  options: { tolerance?: number } = {},
): { tables: DetectedTable[]; consumed: Set<Line> } {
  const tol = options.tolerance ?? 3;
  const tables: DetectedTable[] = [];
  const consumed = new Set<Line>();
  if (rules.length < 4) return { tables, consumed };

  const oriented = rules.map(orient);
  const uf = new UnionFind(oriented.length);
  for (let i = 0; i < oriented.length; i++) {
    for (let j = i + 1; j < oriented.length; j++) {
      const a = oriented[i]!;
      const b = oriented[j]!;
      if (a.horizontal !== b.horizontal) {
        const [h, v] = a.horizontal ? [a, b] : [b, a];
        if (crosses(h, v, tol)) uf.union(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < oriented.length; i++) {
    const root = uf.find(i);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(i);
  }

  for (const idxs of groups.values()) {
    const hs = idxs.map((i) => oriented[i]!).filter((r) => r.horizontal);
    const vs = idxs.map((i) => oriented[i]!).filter((r) => !r.horizontal);
    const rowYs = clusterPositions(hs.map((r) => r.pos), tol);
    const colXs = clusterPositions(vs.map((r) => r.pos), tol);
    if (rowYs.length < 2 || colXs.length < 2) continue;

    const top = rowYs[0]!;
    const bottom = rowYs[rowYs.length - 1]!;
    const left = colXs[0]!;
    const right = colXs[colXs.length - 1]!;

    const nRows = rowYs.length - 1;
    const nCols = colXs.length - 1;
    const grid: string[][] = Array.from({ length: nRows }, () => new Array<string>(nCols).fill(""));
    const used: Line[] = [];

    for (const line of lines) {
      const { cy } = lineCenter(line);
      if (cy < top - tol || cy > bottom + tol) continue;
      // Assign per item, not per line: a single baseline often carries cells in
      // several columns ("Name   Age"), which a whole-line center would merge.
      let placed = false;
      for (const it of line.items) {
        const ix = it.x + it.width / 2;
        const iy = it.y + it.height / 2;
        if (ix < left - tol || ix > right + tol || iy < top - tol || iy > bottom + tol) continue;
        const r = bandIndex(rowYs, iy, tol);
        const c = bandIndex(colXs, ix, tol);
        if (r < 0 || c < 0) continue;
        grid[r]![c] = grid[r]![c] ? `${grid[r]![c]} ${it.text}` : it.text;
        placed = true;
      }
      if (placed) used.push(line);
    }

    // Require the grid to actually carry text, else it is decorative.
    if (used.length === 0) continue;
    for (let r = 0; r < nRows; r++) {
      for (let c = 0; c < nCols; c++) grid[r]![c] = grid[r]![c]!.replace(/\s+/g, " ").trim();
    }
    tables.push({ rows: grid, lines: used });
    for (const l of used) consumed.add(l);
  }

  return { tables, consumed };
}
