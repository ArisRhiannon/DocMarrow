import type { Block, FigureBlock, ListItemNode } from "@docmarrow/core";
import { HTMLElement, parse, TextNode } from "node-html-parser";

const ZERO_BBOX = { x: 0, y: 0, width: 0, height: 0 } as const;
const HTML_CONFIDENCE = 0.9;

export interface HtmlAnalysis {
  blocks: Block[];
  title?: string;
  warnings: string[];
}

const clampHeading = (n: number): 1 | 2 | 3 | 4 => Math.min(4, Math.max(1, n)) as 1 | 2 | 3 | 4;
const normalize = (s: string): string => s.replace(/\s+/g, " ").trim();

const INLINE = new Set([
  "a", "span", "strong", "em", "b", "i", "code", "small", "sub", "sup", "mark", "u",
  "label", "time", "abbr", "cite", "q", "s", "del", "ins", "kbd", "samp", "var", "tt", "font",
]);
const SKIP = new Set(["script", "style", "head", "noscript", "template", "hr", "input"]);

const tagOf = (el: HTMLElement): string => (el.rawTagName ?? el.tagName ?? "").toLowerCase();

/** Best-effort MIME from a filename/URL extension. */
function mimeFromExt(src: string): string | undefined {
  const ext = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(src)?.[1]?.toLowerCase();
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    bmp: "image/bmp",
    tif: "image/tiff",
    tiff: "image/tiff",
    avif: "image/avif",
  };
  return ext ? map[ext] : undefined;
}

/** Decode a `data:` URI into its MIME type and raw bytes (base64 or percent). */
function parseDataUri(src: string): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/i.exec(src);
  if (!m) return null;
  const mime = m[1] || "text/plain";
  const data = m[3] ?? "";
  try {
    const bytes = m[2]
      ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(data));
    return { mime, bytes };
  } catch {
    return null;
  }
}

/** Build a FigureBlock from an `<img>`, or null when it has no usable source. */
function imgFigure(img: HTMLElement): FigureBlock | null {
  const src = (img.getAttribute("src") ?? "").trim();
  if (!src) return null;
  const alt = normalize(img.getAttribute("alt") ?? "");
  const base = {
    type: "figure" as const,
    page: 1 as const,
    bbox: { ...ZERO_BBOX },
    confidence: HTML_CONFIDENCE,
  };
  if (/^data:/i.test(src)) {
    const parsed = parseDataUri(src);
    return parsed ? { ...base, alt, ref: `data:${parsed.mime}`, mime: parsed.mime, bytes: parsed.bytes } : null;
  }
  const mime = mimeFromExt(src);
  return { ...base, alt, ref: src, ...(mime ? { mime } : {}) };
}

/**
 * Build a FigureBlock from an inline `<svg>` (the markup *is* the image), or null
 * for what looks like a decorative icon. Heuristic: capture when it presents as
 * an image — `role="img"`, an `aria-label`, a `<title>`, or a size ≥ 24px —
 * otherwise skip, so icon systems don't flood the output with figures.
 */
function svgFigure(svg: HTMLElement): FigureBlock | null {
  const role = (svg.getAttribute("role") ?? "").toLowerCase();
  const label = svg.getAttribute("aria-label") ?? "";
  const titleEl = svg.querySelector("title");
  const title = titleEl ? normalize(titleEl.text) : "";
  const w = parseFloat(svg.getAttribute("width") ?? "");
  const h = parseFloat(svg.getAttribute("height") ?? "");
  const sizable = (Number.isFinite(w) && w >= 24) || (Number.isFinite(h) && h >= 24);
  if (!(role === "img" || label || title || sizable)) return null;
  return {
    type: "figure",
    alt: normalize(label || title),
    ref: "inline-svg",
    mime: "image/svg+xml",
    bytes: new TextEncoder().encode(svg.toString()),
    page: 1,
    bbox: { ...ZERO_BBOX },
    confidence: HTML_CONFIDENCE,
  };
}

function collectItems(listEl: HTMLElement, level: number): ListItemNode[] {
  const ordered = tagOf(listEl) === "ol";
  const items: ListItemNode[] = [];
  for (const li of listEl.childNodes) {
    if (!(li instanceof HTMLElement) || tagOf(li) !== "li") continue;
    let own = "";
    const nested: HTMLElement[] = [];
    for (const child of li.childNodes) {
      if (child instanceof HTMLElement && (tagOf(child) === "ul" || tagOf(child) === "ol")) {
        nested.push(child);
      } else {
        own += " " + (child instanceof TextNode ? child.text : (child as HTMLElement).text ?? "");
      }
    }
    items.push({ text: normalize(own), level, ordered });
    for (const n of nested) items.push(...collectItems(n, level + 1));
  }
  return items;
}

function tableBlock(tableEl: HTMLElement): Block | null {
  const rows: string[][] = [];
  for (const tr of tableEl.querySelectorAll("tr")) {
    const cells: string[] = [];
    for (const cell of tr.childNodes) {
      if (cell instanceof HTMLElement && (tagOf(cell) === "td" || tagOf(cell) === "th")) {
        cells.push(normalize(cell.text));
      }
    }
    if (cells.length) rows.push(cells);
  }
  if (rows.length === 0) return null;
  return { type: "table", rows, page: 1, bbox: { ...ZERO_BBOX }, confidence: HTML_CONFIDENCE };
}

/** Walk a container's children into blocks, buffering loose inline text into paragraphs. */
function walk(container: HTMLElement): Block[] {
  const blocks: Block[] = [];
  const base = { page: 1 as const, bbox: { ...ZERO_BBOX }, confidence: HTML_CONFIDENCE };
  let buffer = "";
  const flush = (): void => {
    const text = normalize(buffer);
    if (text) blocks.push({ type: "paragraph", text, ...base });
    buffer = "";
  };

  for (const node of container.childNodes) {
    if (node instanceof TextNode) {
      if (!node.isWhitespace) buffer += " " + node.text;
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;
    const t = tagOf(node);

    if (/^h[1-6]$/.test(t)) {
      flush();
      const text = normalize(node.text);
      if (text) blocks.push({ type: "heading", level: clampHeading(Number(t[1])), text, ...base });
    } else if (t === "p") {
      flush();
      const text = normalize(node.text);
      if (text) blocks.push({ type: "paragraph", text, ...base });
      for (const im of node.querySelectorAll("img")) {
        const fig = imgFigure(im);
        if (fig) blocks.push(fig);
      }
    } else if (t === "img") {
      flush();
      const fig = imgFigure(node);
      if (fig) blocks.push(fig);
    } else if (t === "svg") {
      flush();
      const fig = svgFigure(node);
      if (fig) blocks.push(fig);
    } else if (t === "ul" || t === "ol") {
      flush();
      const items = collectItems(node, 0);
      if (items.length) blocks.push({ type: "list", ordered: t === "ol", items, ...base });
    } else if (t === "table") {
      flush();
      const b = tableBlock(node);
      if (b) blocks.push(b);
    } else if (t === "pre") {
      flush();
      const code = node.textContent.replace(/\n+$/g, "");
      if (code.trim()) blocks.push({ type: "code", text: code, ...base });
    } else if (t === "blockquote") {
      flush();
      const q = normalize(node.text);
      if (q) blocks.push({ type: "quote", text: q, ...base });
    } else if (t === "br") {
      buffer += " ";
    } else if (SKIP.has(t)) {
      // ignore non-content elements
    } else if (INLINE.has(t)) {
      buffer += " " + node.text;
    } else {
      // container or unknown block element: recurse for nested content
      flush();
      blocks.push(...walk(node));
    }
  }
  flush();
  return blocks;
}

/**
 * Parse HTML into core blocks: `h1`–`h6` → headings, `p`/loose text →
 * paragraphs, `ul`/`ol` → nested lists, `table` → tables, `pre` → code,
 * `blockquote` → quotes. Pure JS (node-html-parser); runs anywhere.
 */
export function analyzeHtml(input: string | Uint8Array): HtmlAnalysis {
  const html = typeof input === "string" ? input : new TextDecoder().decode(input);
  const root = parse(html);
  const body = root.querySelector("body") ?? root;
  const blocks = walk(body);

  let title = root.querySelector("title")?.text?.trim() || undefined;
  if (!title) {
    const h1 = blocks.find((b) => b.type === "heading" && b.level === 1);
    if (h1 && "text" in h1) title = h1.text;
  }

  const warnings: string[] = [];
  if (blocks.length === 0) warnings.push("The HTML document contained no extractable content.");
  return { blocks, ...(title ? { title } : {}), warnings };
}
