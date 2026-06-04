import { boundingBox, type Line } from "./layout.js";
import type { Block, ListItemNode } from "./types.js";

const BULLET = /^\s*([•◦▪‣·∙*]|[-–—])\s+/u;
const ORDERED = /^\s*(\(?\d{1,3}\)|\d{1,3}[.)]|[a-zA-Z][.)])\s+/u;

function listMarker(text: string): { ordered: boolean; rest: string } | null {
  const o = ORDERED.exec(text);
  if (o) return { ordered: true, rest: text.slice(o[0].length).trim() };
  const b = BULLET.exec(text);
  if (b) return { ordered: false, rest: text.slice(b[0].length).trim() };
  return null;
}

function headingLevel(line: Line, bodyFont: number): 1 | 2 | 3 | 4 | null {
  const ratio = line.fontSize / bodyFont;
  // Long lines are prose, not headings, even if slightly larger.
  const tooLong = line.text.length > 140;
  if (ratio >= 1.8 && !tooLong) return 1;
  if (ratio >= 1.45 && !tooLong) return 2;
  if (ratio >= 1.2 && !tooLong) return 3;
  // Bold, short, standalone lines read as low-level headings.
  if (line.bold && ratio >= 1.0 && line.text.length <= 80) return 4;
  return null;
}

/**
 * Convert a page's ordered, table-free lines into structured blocks.
 *
 * @param lines    Lines in reading order (tables already removed).
 * @param page     1-based page index.
 * @param bodyFont Document-wide body font size, used as the heading baseline.
 * @param leftMargin Smallest x on the page, used as the indentation origin.
 */
export function structureLines(
  lines: Line[],
  page: number,
  bodyFont: number,
  leftMargin: number,
): Block[] {
  const blocks: Block[] = [];
  const indentUnit = bodyFont * 1.5;
  // Adaptive paragraph spacing: the typical line pitch on this page. A larger
  // gap signals a paragraph break. This adapts to single/loose line spacing
  // instead of relying on a fixed font-size fraction.
  const pitch = medianPitch(lines) || bodyFont * 1.4;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    const level = headingLevel(line, bodyFont);
    if (level !== null && listMarker(line.text) === null) {
      blocks.push({
        type: "heading",
        level,
        text: line.text,
        page,
        bbox: { x: line.x, y: line.y, width: line.width, height: line.height },
        confidence: 0.7,
      });
      i++;
      continue;
    }

    if (listMarker(line.text) !== null) {
      const items: ListItemNode[] = [];
      const used: Line[] = [];
      let ordered = false;
      while (i < lines.length) {
        const m = listMarker(lines[i]!.text);
        if (m === null) break;
        const cur = lines[i]!;
        ordered = ordered || m.ordered;
        const depth = Math.max(0, Math.round((cur.x - leftMargin) / indentUnit));
        items.push({ text: m.rest, level: depth });
        used.push(cur);
        i++;
      }
      blocks.push({
        type: "list",
        ordered,
        items,
        page,
        bbox: boundingBox(used),
        confidence: 0.65,
      });
      continue;
    }

    // Paragraph: merge following body lines until a gap or a structural break.
    const para: Line[] = [line];
    i++;
    while (i < lines.length) {
      const prev = para[para.length - 1]!;
      const next = lines[i]!;
      const delta = next.y - prev.y;
      const isStructural =
        headingLevel(next, bodyFont) !== null || listMarker(next.text) !== null;
      // delta <= 0 means we moved up the page (new column) — always break.
      if (isStructural || delta <= 0 || delta > pitch * 1.4) break;
      para.push(next);
      i++;
    }
    blocks.push({
      type: "paragraph",
      text: joinParagraph(para),
      page,
      bbox: boundingBox(para),
      confidence: 0.8,
    });
  }

  return blocks;
}

/** Median of positive consecutive top-to-top distances between lines. */
function medianPitch(lines: Line[]): number {
  const deltas: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const d = lines[i]!.y - lines[i - 1]!.y;
    if (d > 0) deltas.push(d);
  }
  if (deltas.length === 0) return 0;
  deltas.sort((a, b) => a - b);
  return deltas[deltas.length >> 1]!;
}

/** Join wrapped lines, de-hyphenating soft line-break hyphens. */
function joinParagraph(lines: Line[]): string {
  let out = "";
  for (const l of lines) {
    const t = l.text.trim();
    if (out.length === 0) {
      out = t;
    } else if (/[A-Za-zÀ-ÿ]-$/.test(out)) {
      out = out.slice(0, -1) + t;
    } else {
      out += " " + t;
    }
  }
  return out.replace(/\s+/g, " ").trim();
}
