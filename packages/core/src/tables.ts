import type { Line } from "./layout.js";
import { median } from "./layout.js";
import type { TextItem } from "./types.js";

/**
 * Basic geometric table detection.
 *
 * Strategy: split each line into "cells" at wide horizontal gaps, then look for
 * runs of vertically adjacent lines whose cells align into shared columns. This
 * recovers the common case of whitespace- or rule-separated grids in digital
 * PDFs. It does NOT attempt ruled-line vector analysis, rotated tables, or
 * spanning/merged-cell reconstruction — those are out of scope for the `fast`
 * detector and are candidates for the `boost` refiner.
 */
export interface DetectedTable {
  rows: string[][];
  lines: Line[];
}

interface Cell {
  x0: number;
  x1: number;
  text: string;
}

/** Split a line into cells at horizontal gaps wider than ~1 em. */
function splitCells(line: Line): Cell[] {
  const items = [...line.items].sort((a, b) => a.x - b.x);
  if (items.length === 0) return [];
  const gapThreshold = Math.max(line.fontSize * 1.0, 8);

  const cells: Cell[] = [];
  let cur: TextItem[] = [items[0]!];
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1]!;
    const it = items[i]!;
    const gap = it.x - (prev.x + prev.width);
    if (gap > gapThreshold) {
      cells.push(makeCell(cur));
      cur = [];
    }
    cur.push(it);
  }
  if (cur.length) cells.push(makeCell(cur));
  return cells;
}

function makeCell(items: TextItem[]): Cell {
  const x0 = Math.min(...items.map((i) => i.x));
  const x1 = Math.max(...items.map((i) => i.x + i.width));
  const text = items
    .map((i) => i.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return { x0, x1, text };
}

/** Cluster cell start positions into shared column anchors. */
function columnAnchors(rows: Cell[][], tol: number): number[] {
  const xs = rows.flatMap((r) => r.map((c) => c.x0)).sort((a, b) => a - b);
  const anchors: number[] = [];
  for (const x of xs) {
    const last = anchors[anchors.length - 1];
    if (last === undefined || x - last > tol) anchors.push(x);
  }
  return anchors;
}

function assignToColumns(cells: Cell[], anchors: number[]): string[] {
  const out = new Array<string>(anchors.length).fill("");
  for (const cell of cells) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < anchors.length; i++) {
      const d = Math.abs(cell.x0 - anchors[i]!);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    out[best] = out[best] ? `${out[best]} ${cell.text}` : cell.text;
  }
  return out;
}

/**
 * Detect tables in a page's lines (assumed already in reading order).
 * Returns the tables found and the set of lines they consumed.
 */
export function detectTables(lines: Line[]): { tables: DetectedTable[]; consumed: Set<Line> } {
  const tables: DetectedTable[] = [];
  const consumed = new Set<Line>();
  if (lines.length < 2) return { tables, consumed };

  const lineGap = median(lines.map((l) => l.fontSize)) * 2.5;

  let i = 0;
  while (i < lines.length) {
    const cellsOf = splitCells(lines[i]!);
    if (cellsOf.length < 2) {
      i++;
      continue;
    }

    // Extend a run while subsequent lines are tabular and vertically adjacent.
    const run: Line[] = [lines[i]!];
    const runCells: Cell[][] = [cellsOf];
    let j = i + 1;
    while (j < lines.length) {
      const prev = lines[j - 1]!;
      const next = lines[j]!;
      const cells = splitCells(next);
      const adjacent = next.y - (prev.y + prev.height) < lineGap;
      if (cells.length < 2 || !adjacent) break;
      run.push(next);
      runCells.push(cells);
      j++;
    }

    if (run.length >= 2) {
      const tol = median(run.map((l) => l.fontSize)) * 1.5;
      const anchors = columnAnchors(runCells, tol);
      if (anchors.length >= 2) {
        const rows = runCells.map((cells) => assignToColumns(cells, anchors));
        const populated = rows.filter((r) => r.filter((c) => c).length >= 2).length;
        if (populated >= Math.ceil(rows.length / 2)) {
          tables.push({ rows, lines: run });
          for (const l of run) consumed.add(l);
          i = j;
          continue;
        }
      }
    }
    i++;
  }

  return { tables, consumed };
}
