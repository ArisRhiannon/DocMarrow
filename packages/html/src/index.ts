import type { Block, ListItemNode } from "@docmarrow/core";
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
const SKIP = new Set(["script", "style", "svg", "head", "noscript", "template", "img", "hr", "input"]);

const tagOf = (el: HTMLElement): string => (el.rawTagName ?? el.tagName ?? "").toLowerCase();

function collectItems(listEl: HTMLElement, level: number): ListItemNode[] {
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
    items.push({ text: normalize(own), level });
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
