import type { BBox, TextItem } from "./types.js";

/** A horizontal line of text assembled from one or more {@link TextItem}s. */
export interface Line {
  items: TextItem[];
  text: string;
  /** Bounding box of the whole line. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Median font size of the constituent items. */
  fontSize: number;
  bold: boolean;
  italic: boolean;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Vertical center of an item's glyph box. */
const midY = (it: TextItem): number => it.y + it.height / 2;

/**
 * Group items into lines. Items belong to the same line when their vertical
 * centers are within `tolerance * fontSize` of each other. Within a line,
 * items are ordered left-to-right and joined with single spaces only where a
 * real horizontal gap exists (so kerned runs are not artificially spaced).
 */
export function groupLines(items: TextItem[], tolerance = 0.5): Line[] {
  const visible = items.filter((it) => it.text.trim().length > 0);
  if (visible.length === 0) return [];

  // Seed lines by scanning items sorted top-to-bottom.
  const sorted = [...visible].sort((a, b) => midY(a) - midY(b) || a.x - b.x);
  const buckets: TextItem[][] = [];
  for (const it of sorted) {
    const last = buckets[buckets.length - 1];
    if (last) {
      const ref = last[0]!;
      const tol = Math.max(ref.height, it.height) * tolerance;
      if (Math.abs(midY(it) - midY(ref)) <= tol) {
        last.push(it);
        continue;
      }
    }
    buckets.push([it]);
  }

  return buckets.map(toLine);
}

function toLine(group: TextItem[]): Line {
  const items = [...group].sort((a, b) => a.x - b.x);
  const fontSize = median(items.map((i) => i.fontSize));
  const spaceWidth = fontSize * 0.25;

  let text = "";
  let prevRight = Number.NaN;
  for (const it of items) {
    const chunk = it.text;
    if (text.length > 0) {
      const gap = it.x - prevRight;
      const needsSpace = gap > spaceWidth && !text.endsWith(" ") && !chunk.startsWith(" ");
      if (needsSpace) text += " ";
    }
    text += chunk;
    prevRight = it.x + it.width;
  }

  const bbox = boundingBox(items);
  // A line is bold/italic when the majority of its glyph width is bold/italic.
  const totalW = items.reduce((s, i) => s + Math.max(i.width, 1), 0) || 1;
  const boldW = items.reduce((s, i) => s + (i.bold ? Math.max(i.width, 1) : 0), 0);
  const italicW = items.reduce((s, i) => s + (i.italic ? Math.max(i.width, 1) : 0), 0);

  return {
    items,
    text: text.replace(/\s+/g, " ").trim(),
    x: bbox.x,
    y: bbox.y,
    width: bbox.width,
    height: bbox.height,
    fontSize,
    bold: boldW / totalW > 0.6,
    italic: italicW / totalW > 0.6,
  };
}

export function boundingBox(items: Array<Pick<TextItem, "x" | "y" | "width" | "height">>): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    minX = Math.min(minX, it.x);
    minY = Math.min(minY, it.y);
    maxX = Math.max(maxX, it.x + it.width);
    maxY = Math.max(maxY, it.y + it.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function unionBBox(boxes: BBox[]): BBox {
  return boundingBox(boxes.map((b) => ({ x: b.x, y: b.y, width: b.width, height: b.height })));
}
