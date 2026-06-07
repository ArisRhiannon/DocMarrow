import type { Block, ListItemNode } from "@docparse/core";
import {
  attr,
  childrenNamed,
  childrenOf,
  deepFirst,
  firstChild,
  parseXml,
  tagName,
  textOf,
  type XmlNode,
} from "./xml.js";

/** DOCX blocks come from author-declared structure, so confidence is uniformly
 * high (unlike the geometric PDF heuristics). bbox is meaningless for a flow
 * format and is reported as zero. */
const DOCX_CONFIDENCE = 0.95;
const ZERO_BBOX = { x: 0, y: 0, width: 0, height: 0 } as const;

const clampHeading = (n: number): 1 | 2 | 3 | 4 =>
  (Math.min(4, Math.max(1, n)) as 1 | 2 | 3 | 4);

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

/** Recursively collect text, honouring tabs and explicit line/page breaks. */
function collectText(node: XmlNode): string {
  const name = tagName(node);
  if (name === "w:t") {
    return childrenOf(node)
      .map((c) => textOf(c) ?? "")
      .join("");
  }
  if (name === "w:tab") return "\t";
  if (name === "w:br" || name === "w:cr") return "\n";
  if (name === "w:noBreakHyphen") return "-";
  return childrenOf(node).map(collectText).join("");
}

/** Prose text: line breaks and tabs collapse to single spaces. */
function plainText(node: XmlNode): string {
  return collectText(node).replace(/\s+/g, " ").trim();
}

/** Code text: internal line breaks are preserved; surrounding blanks trimmed. */
function codeText(node: XmlNode): string {
  return collectText(node).replace(/\t/g, "    ").replace(/[ \t]+$/gm, "").replace(/^\n+|\n+$/g, "");
}

// ---------------------------------------------------------------------------
// Numbering (ordered vs bullet)
// ---------------------------------------------------------------------------

/** Build a `(numId, ilvl) -> ordered?` resolver from `word/numbering.xml`. */
function buildNumbering(xml: string | undefined): (numId: string, ilvl: number) => boolean {
  if (!xml) return () => false;
  const numbering = deepFirst(parseXml(xml), "w:numbering");
  if (!numbering) return () => false;

  const abstractFmt = new Map<string, Map<number, string>>();
  for (const an of childrenNamed(numbering, "w:abstractNum")) {
    const aid = attr(an, "w:abstractNumId");
    if (aid === undefined) continue;
    const levels = new Map<number, string>();
    for (const lvl of childrenNamed(an, "w:lvl")) {
      const ilvl = Number(attr(lvl, "w:ilvl") ?? "0");
      const fmtNode = firstChild(lvl, "w:numFmt");
      levels.set(ilvl, (fmtNode && attr(fmtNode, "w:val")) || "bullet");
    }
    abstractFmt.set(aid, levels);
  }

  const numToAbstract = new Map<string, string>();
  for (const num of childrenNamed(numbering, "w:num")) {
    const numId = attr(num, "w:numId");
    const abstractRef = firstChild(num, "w:abstractNumId");
    const aid = abstractRef ? attr(abstractRef, "w:val") : undefined;
    if (numId !== undefined && aid !== undefined) numToAbstract.set(numId, aid);
  }

  const isOrdered = (fmt: string | undefined): boolean =>
    fmt !== undefined && fmt !== "bullet" && fmt !== "none";

  return (numId, ilvl) => {
    const aid = numToAbstract.get(numId);
    if (aid === undefined) return false;
    const levels = abstractFmt.get(aid);
    return isOrdered(levels?.get(ilvl) ?? levels?.get(0));
  };
}

// ---------------------------------------------------------------------------
// Styles (heading / quote / code classification)
// ---------------------------------------------------------------------------

interface StyleInfo {
  name?: string;
  outlineLevel?: number;
}

function buildStyles(xml: string | undefined): Map<string, StyleInfo> {
  const map = new Map<string, StyleInfo>();
  if (!xml) return map;
  const styles = deepFirst(parseXml(xml), "w:styles");
  if (!styles) return map;
  for (const style of childrenNamed(styles, "w:style")) {
    const id = attr(style, "w:styleId");
    if (id === undefined) continue;
    const nameNode = firstChild(style, "w:name");
    const pPr = firstChild(style, "w:pPr");
    const outlineNode = pPr ? firstChild(pPr, "w:outlineLvl") : undefined;
    const info: StyleInfo = {};
    const name = nameNode ? attr(nameNode, "w:val") : undefined;
    if (name !== undefined) info.name = name;
    if (outlineNode) {
      const lvl = Number(attr(outlineNode, "w:val"));
      if (Number.isFinite(lvl)) info.outlineLevel = lvl;
    }
    map.set(id, info);
  }
  return map;
}

type StyleKind =
  | { type: "heading"; level: 1 | 2 | 3 | 4 }
  | { type: "quote" }
  | { type: "code" }
  | { type: "normal" };

function classifyStyle(
  styleId: string,
  style: StyleInfo | undefined,
  outlineFromParagraph: number | undefined,
): StyleKind {
  const name = style?.name ?? "";
  const matches = (re: RegExp): boolean => re.test(styleId) || re.test(name);

  if (matches(/code|preformatted|html\s*pre|source\s*code|listing/i)) return { type: "code" };
  if (matches(/quote/i)) return { type: "quote" };

  const headingMatch = /heading\s*([1-9])/i.exec(styleId) || /heading\s*([1-9])/i.exec(name);
  if (headingMatch) return { type: "heading", level: clampHeading(Number(headingMatch[1])) };
  if (/^title$/i.test(styleId) || /^title$/i.test(name)) return { type: "heading", level: 1 };
  if (/^subtitle$/i.test(styleId) || /^subtitle$/i.test(name)) return { type: "heading", level: 2 };

  const outline = outlineFromParagraph ?? style?.outlineLevel;
  if (outline !== undefined && outline >= 0 && outline <= 8) {
    return { type: "heading", level: clampHeading(outline + 1) };
  }
  return { type: "normal" };
}

// ---------------------------------------------------------------------------
// Paragraph properties
// ---------------------------------------------------------------------------

interface ParaProps {
  styleId?: string;
  numId?: string;
  ilvl: number;
  outline?: number;
}

function paragraphProps(p: XmlNode): ParaProps {
  const props: ParaProps = { ilvl: 0 };
  const pPr = firstChild(p, "w:pPr");
  if (!pPr) return props;

  const pStyle = firstChild(pPr, "w:pStyle");
  if (pStyle) props.styleId = attr(pStyle, "w:val");

  const numPr = firstChild(pPr, "w:numPr");
  if (numPr) {
    const numIdNode = firstChild(numPr, "w:numId");
    if (numIdNode) props.numId = attr(numIdNode, "w:val");
    const ilvlNode = firstChild(numPr, "w:ilvl");
    if (ilvlNode) props.ilvl = Number(attr(ilvlNode, "w:val") ?? "0") || 0;
  }

  const outlineNode = firstChild(pPr, "w:outlineLvl");
  if (outlineNode) {
    const lvl = Number(attr(outlineNode, "w:val"));
    if (Number.isFinite(lvl)) props.outline = lvl;
  }
  return props;
}

const isListParagraph = (props: ParaProps): boolean =>
  props.numId !== undefined && props.numId !== "0";

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function tableRows(tbl: XmlNode): string[][] {
  return childrenNamed(tbl, "w:tr").map((tr) =>
    childrenNamed(tr, "w:tc").map((tc) => plainText(tc)),
  );
}

// ---------------------------------------------------------------------------
// Body → intermediate items → blocks
// ---------------------------------------------------------------------------

type Item =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "code"; text: string }
  | { kind: "list"; numId: string; ordered: boolean; level: number; text: string }
  | { kind: "table"; rows: string[][] };

function bodyItems(
  body: XmlNode,
  styles: Map<string, StyleInfo>,
  orderedOf: (numId: string, ilvl: number) => boolean,
): Item[] {
  const items: Item[] = [];
  for (const node of childrenOf(body)) {
    const name = tagName(node);

    if (name === "w:tbl") {
      const rows = tableRows(node).filter((r) => r.length > 0);
      if (rows.length) items.push({ kind: "table", rows });
      continue;
    }
    if (name !== "w:p") continue; // sectPr, bookmarks, etc.

    const props = paragraphProps(node);
    if (isListParagraph(props)) {
      const text = plainText(node);
      if (text) {
        items.push({
          kind: "list",
          numId: props.numId!,
          ordered: orderedOf(props.numId!, props.ilvl),
          level: props.ilvl,
          text,
        });
      }
      continue;
    }

    const kind = classifyStyle(props.styleId ?? "", styles.get(props.styleId ?? ""), props.outline);
    if (kind.type === "code") {
      const text = codeText(node);
      if (text) items.push({ kind: "code", text });
      continue;
    }
    const text = plainText(node);
    if (!text) continue;
    if (kind.type === "heading") items.push({ kind: "heading", level: kind.level, text });
    else if (kind.type === "quote") items.push({ kind: "quote", text });
    else items.push({ kind: "paragraph", text });
  }
  return items;
}

/** Fold the ordered items into blocks, merging consecutive list/code runs. */
function foldBlocks(items: Item[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < items.length) {
    const it = items[i]!;

    if (it.kind === "list") {
      const numId = it.numId;
      const listItems: ListItemNode[] = [];
      let ordered = false;
      while (i < items.length) {
        const cur = items[i]!;
        if (cur.kind !== "list" || cur.numId !== numId) break;
        listItems.push({ text: cur.text, level: cur.level });
        ordered = ordered || cur.ordered;
        i++;
      }
      blocks.push({
        type: "list",
        ordered,
        items: listItems,
        page: 1,
        bbox: { ...ZERO_BBOX },
        confidence: DOCX_CONFIDENCE,
      });
      continue;
    }

    if (it.kind === "code") {
      const lines: string[] = [];
      while (i < items.length && items[i]!.kind === "code") {
        lines.push((items[i]! as Extract<Item, { kind: "code" }>).text);
        i++;
      }
      blocks.push({
        type: "code",
        text: lines.join("\n"),
        page: 1,
        bbox: { ...ZERO_BBOX },
        confidence: DOCX_CONFIDENCE,
      });
      continue;
    }

    if (it.kind === "table") {
      blocks.push({
        type: "table",
        rows: it.rows,
        page: 1,
        bbox: { ...ZERO_BBOX },
        confidence: DOCX_CONFIDENCE,
      });
    } else if (it.kind === "heading") {
      blocks.push({
        type: "heading",
        level: it.level,
        text: it.text,
        page: 1,
        bbox: { ...ZERO_BBOX },
        confidence: DOCX_CONFIDENCE,
      });
    } else if (it.kind === "quote") {
      blocks.push({
        type: "quote",
        text: it.text,
        page: 1,
        bbox: { ...ZERO_BBOX },
        confidence: DOCX_CONFIDENCE,
      });
    } else {
      blocks.push({
        type: "paragraph",
        text: it.text,
        page: 1,
        bbox: { ...ZERO_BBOX },
        confidence: DOCX_CONFIDENCE,
      });
    }
    i++;
  }
  return blocks;
}

/** Map a parsed `word/document.xml` (+ styles/numbering) into core blocks. */
export function documentToBlocks(
  documentXml: string,
  stylesXml: string | undefined,
  numberingXml: string | undefined,
): Block[] {
  const document = deepFirst(parseXml(documentXml), "w:document");
  const body = document ? firstChild(document, "w:body") : undefined;
  if (!body) return [];
  const styles = buildStyles(stylesXml);
  const orderedOf = buildNumbering(numberingXml);
  return foldBlocks(bodyItems(body, styles, orderedOf));
}

/** Extract the document title from `docProps/core.xml`, if present. */
export function coreTitle(coreXml: string | undefined): string | undefined {
  if (!coreXml) return undefined;
  const title = deepFirst(parseXml(coreXml), "dc:title");
  if (!title) return undefined;
  const text = childrenOf(title)
    .map((c) => textOf(c) ?? "")
    .join("")
    .trim();
  return text || undefined;
}
