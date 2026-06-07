import type { Block, FigureBlock, ListItemNode } from "@docmarrow/core";
import {
  attr,
  childrenNamed,
  childrenOf,
  collectAllText,
  deepFirst,
  firstChild,
  mimeFromExt,
  parseXml,
  readBinaryEntries,
  readXmlParts,
  tagName,
  textOf,
  type XmlNode,
} from "@docmarrow/ooxml";

const ZERO_BBOX = { x: 0, y: 0, width: 0, height: 0 } as const;
const PPTX_CONFIDENCE = 0.9;

export interface PptxAnalysis {
  blocks: Block[];
  title?: string;
  warnings: string[];
}

/** Options for the PPTX backend. */
export interface PptxOptions {
  /**
   * Extract speaker notes (`ppt/notesSlides/*`) and append them per slide as a
   * quote block. Off by default: notes are presenter-private and add noise, so
   * including them is a deliberate opt-in.
   */
  speakerNotes?: boolean;
}

/** Paragraph text (joining runs; line breaks become spaces) + outline level + ordered. */
function paragraphInfo(p: XmlNode): { text: string; level: number; ordered: boolean } {
  const text = collectAllText(p, (t) => (t === "a:br" ? " " : undefined))
    .replace(/\s+/g, " ")
    .trim();
  const pPr = firstChild(p, "a:pPr");
  const level = pPr ? Number(attr(pPr, "lvl") ?? "0") || 0 : 0;
  // An auto-numbered bullet (a:buAutoNum) makes the item ordered; buChar/buNone/none stay bullets.
  const ordered = pPr ? firstChild(pPr, "a:buAutoNum") !== undefined : false;
  return { text, level, ordered };
}

/** The placeholder type of a shape (`title`, `ctrTitle`, `body`, …) if any. */
function placeholderType(sp: XmlNode): string | undefined {
  const ph = deepFirst(childrenOf(sp), "p:ph");
  return ph ? attr(ph, "type") : undefined;
}

const isTitlePh = (type: string | undefined): boolean => type === "title" || type === "ctrTitle";

/** Pull `ppt/media/*` (embedded images) out as raw bytes; empty on failure. */
function readMedia(bytes: Uint8Array): Map<string, Uint8Array> {
  try {
    return readBinaryEntries(bytes, (name) => name.startsWith("ppt/media/"));
  } catch {
    return new Map();
  }
}

/** Resolve a relationship id to an image ref / mime / bytes for one slide. */
type ImageResolver = (rId: string) => { ref: string; mime?: string; bytes?: Uint8Array } | null;

/** Resolve an OPC relative target against a part's base directory. */
function resolveRel(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const out: string[] = [];
  for (const seg of (baseDir + target).split("/")) {
    if (seg === "..") out.pop();
    else if (seg !== "." && seg !== "") out.push(seg);
  }
  return out.join("/");
}

/** Build an rId → image resolver from a slide's rels and the presentation media. */
function buildSlideImages(
  relsXml: string | undefined,
  media: Map<string, Uint8Array>,
  baseDir: string,
): ImageResolver {
  const targets = new Map<string, { target: string; external: boolean }>();
  if (relsXml) {
    const rels = deepFirst(parseXml(relsXml), "Relationships");
    for (const rel of rels ? childrenNamed(rels, "Relationship") : []) {
      const id = attr(rel, "Id");
      const target = attr(rel, "Target");
      if (!id || !target) continue;
      targets.set(id, { target, external: (attr(rel, "TargetMode") ?? "").toLowerCase() === "external" });
    }
  }
  return (rId) => {
    const t = targets.get(rId);
    if (!t) return null;
    if (t.external || /^https?:/i.test(t.target)) {
      const mime = mimeFromExt(t.target);
      return { ref: t.target, ...(mime ? { mime } : {}) };
    }
    const path = resolveRel(baseDir, t.target);
    const bytes = media.get(path);
    const mime = mimeFromExt(path);
    return { ref: path, ...(mime ? { mime } : {}), ...(bytes ? { bytes } : {}) };
  };
}

/** Resolve the notesSlide part linked from a slide's relationships, if any. */
function findNotesTarget(relsXml: string, baseDir: string): string | undefined {
  const rels = deepFirst(parseXml(relsXml), "Relationships");
  for (const rel of rels ? childrenNamed(rels, "Relationship") : []) {
    const target = attr(rel, "Target");
    if (target && /notesSlide/i.test(attr(rel, "Type") ?? "")) return resolveRel(baseDir, target);
  }
  return undefined;
}

/** Text of a notesSlide's body placeholder (the speaker notes), paragraphs joined. */
function extractNotes(xml: string): string {
  const notes = deepFirst(parseXml(xml), "p:notes");
  const spTree = notes ? deepFirst(childrenOf(notes), "p:spTree") : undefined;
  if (!spTree) return "";
  for (const sp of childrenOf(spTree)) {
    if (tagName(sp) !== "p:sp" || placeholderType(sp) !== "body") continue;
    const tx = firstChild(sp, "p:txBody");
    if (!tx) continue;
    return childrenNamed(tx, "a:p")
      .map((p) => paragraphInfo(p).text)
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/** Build a FigureBlock from a `p:pic` shape, or null if its image is missing. */
function picFigure(pic: XmlNode, images: ImageResolver): FigureBlock | null {
  const blip = deepFirst([pic], "a:blip");
  const rId = blip ? (attr(blip, "r:embed") ?? attr(blip, "r:link")) : undefined;
  if (!rId) return null;
  const img = images(rId);
  if (!img) return null;
  const cNvPr = deepFirst([pic], "p:cNvPr");
  const alt = cNvPr ? (attr(cNvPr, "descr") ?? attr(cNvPr, "name") ?? "").replace(/\s+/g, " ").trim() : "";
  return {
    type: "figure",
    alt,
    ref: img.ref,
    ...(img.mime ? { mime: img.mime } : {}),
    ...(img.bytes ? { bytes: img.bytes } : {}),
    page: 1,
    bbox: { ...ZERO_BBOX },
    confidence: PPTX_CONFIDENCE,
  };
}

function tableBlock(graphicFrame: XmlNode): Block | null {
  const tbl = deepFirst(childrenOf(graphicFrame), "a:tbl");
  if (!tbl) return null;
  const rows = childrenNamed(tbl, "a:tr").map((tr) =>
    childrenNamed(tr, "a:tc").map((tc) => collectAllText(tc).replace(/\s+/g, " ").trim()),
  );
  if (rows.length === 0) return null;
  return { type: "table", rows, page: 1, bbox: { ...ZERO_BBOX }, confidence: PPTX_CONFIDENCE };
}

/** Flatten a spTree into ordered shapes, descending into groups. */
function shapesOf(spTree: XmlNode): XmlNode[] {
  const out: XmlNode[] = [];
  for (const node of childrenOf(spTree)) {
    const tag = tagName(node);
    if (tag === "p:sp" || tag === "p:graphicFrame" || tag === "p:pic") out.push(node);
    else if (tag === "p:grpSp") out.push(...shapesOf(node));
  }
  return out;
}

function slideBlocks(xml: string, slideNumber: number, images: ImageResolver): Block[] {
  const sld = deepFirst(parseXml(xml), "p:sld");
  const spTree = sld ? deepFirst(childrenOf(sld), "p:spTree") : undefined;
  if (!spTree) return [];
  const shapes = shapesOf(spTree);

  // Title: the first title placeholder's text, else "Slide N".
  let title: string | undefined;
  for (const sp of shapes) {
    if (tagName(sp) === "p:sp" && isTitlePh(placeholderType(sp))) {
      const tx = firstChild(sp, "p:txBody");
      const text = tx
        ? childrenNamed(tx, "a:p").map((p) => paragraphInfo(p).text).filter(Boolean).join(" ")
        : "";
      if (text) {
        title = text;
        break;
      }
    }
  }

  const blocks: Block[] = [
    {
      type: "heading",
      level: 1,
      text: title ?? `Slide ${slideNumber}`,
      page: 1,
      bbox: { ...ZERO_BBOX },
      confidence: PPTX_CONFIDENCE,
    },
  ];

  for (const sp of shapes) {
    const tag = tagName(sp);
    if (tag === "p:graphicFrame") {
      const t = tableBlock(sp);
      if (t) blocks.push(t);
      continue;
    }
    if (tag === "p:pic") {
      const f = picFigure(sp, images);
      if (f) blocks.push(f);
      continue;
    }
    // p:sp
    const phType = placeholderType(sp);
    if (isTitlePh(phType)) continue; // already used as the slide heading
    const tx = firstChild(sp, "p:txBody");
    if (!tx) continue;
    const paras = childrenNamed(tx, "a:p")
      .map(paragraphInfo)
      .filter((p) => p.text.length > 0);
    if (paras.length === 0) continue;

    // Body placeholders / multi-line text read as bullet lists; a lone line of
    // a free text box reads as a paragraph.
    const asList = paras.length >= 2 || paras.some((p) => p.level > 0);
    if (asList) {
      const items: ListItemNode[] = paras.map((p) => ({
        text: p.text,
        level: p.level,
        ordered: p.ordered,
      }));
      blocks.push({
        type: "list",
        ordered: paras.some((p) => p.ordered),
        items,
        page: 1,
        bbox: { ...ZERO_BBOX },
        confidence: PPTX_CONFIDENCE,
      });
    } else {
      blocks.push({
        type: "paragraph",
        text: paras[0]!.text,
        page: 1,
        bbox: { ...ZERO_BBOX },
        confidence: PPTX_CONFIDENCE,
      });
    }
  }
  return blocks;
}

/** Resolve slide part paths in presentation order. */
function resolveSlides(parts: Map<string, string>): string[] {
  const presXml = parts.get("ppt/presentation.xml");
  const relsXml = parts.get("ppt/_rels/presentation.xml.rels");

  const ridToTarget = new Map<string, string>();
  if (relsXml) {
    const rels = deepFirst(parseXml(relsXml), "Relationships");
    for (const rel of rels ? childrenNamed(rels, "Relationship") : []) {
      const id = attr(rel, "Id");
      const target = attr(rel, "Target");
      if (id && target) ridToTarget.set(id, target);
    }
  }
  const resolvePath = (target: string): string => {
    const clean = target.replace(/^\//, "").replace(/^\.\.\//, "");
    return clean.startsWith("ppt/") ? clean : `ppt/${clean}`;
  };

  const ordered: string[] = [];
  if (presXml) {
    const pres = deepFirst(parseXml(presXml), "p:presentation");
    const lst = pres ? firstChild(pres, "p:sldIdLst") : undefined;
    for (const sldId of lst ? childrenNamed(lst, "p:sldId") : []) {
      const rid = attr(sldId, "r:id");
      const target = rid ? ridToTarget.get(rid) : undefined;
      if (target) ordered.push(resolvePath(target));
    }
  }
  if (ordered.length > 0) return ordered;

  // Fallback: every slide part, sorted by numeric suffix.
  return [...parts.keys()]
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(/(\d+)\.xml$/.exec(a)?.[1] ?? 0);
      const nb = Number(/(\d+)\.xml$/.exec(b)?.[1] ?? 0);
      return na - nb;
    });
}

function coreTitle(xml: string | undefined): string | undefined {
  if (!xml) return undefined;
  const title = deepFirst(parseXml(xml), "dc:title");
  if (!title) return undefined;
  const text = childrenOf(title)
    .map((c) => textOf(c) ?? "")
    .join("")
    .trim();
  return text || undefined;
}

/**
 * Parse PPTX (OOXML presentation) bytes into core blocks: each slide yields a
 * level-1 heading (its title, or "Slide N"), then its body text (bulleted body
 * placeholders become lists) and any tables, in presentation order. Pure JS.
 */
export function analyzePptx(bytes: Uint8Array, options: PptxOptions = {}): PptxAnalysis {
  let parts: Map<string, string>;
  try {
    parts = readXmlParts(bytes);
  } catch (err) {
    throw new Error(
      `Not a valid PPTX (failed to read the OOXML zip container): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  if (!parts.has("ppt/presentation.xml")) {
    throw new Error("Not a valid PPTX: the archive has no ppt/presentation.xml part.");
  }

  const slides = resolveSlides(parts);
  const media = readMedia(bytes);
  const blocks: Block[] = [];
  slides.forEach((path, i) => {
    const xml = parts.get(path);
    if (!xml) return;
    const slash = path.lastIndexOf("/");
    const dir = path.slice(0, slash + 1);
    const file = path.slice(slash + 1);
    const relsXml = parts.get(`${dir}_rels/${file}.rels`);
    const images = buildSlideImages(relsXml, media, dir);
    const slideBs = slideBlocks(xml, i + 1, images);

    if (options.speakerNotes && relsXml) {
      const notesPath = findNotesTarget(relsXml, dir);
      const notesXml = notesPath ? parts.get(notesPath) : undefined;
      const notes = notesXml ? extractNotes(notesXml) : "";
      if (notes) {
        slideBs.push({
          type: "quote",
          text: notes,
          page: 1,
          bbox: { ...ZERO_BBOX },
          confidence: PPTX_CONFIDENCE,
        });
      }
    }
    blocks.push(...slideBs);
  });

  const title = coreTitle(parts.get("docProps/core.xml"));
  const warnings: string[] = [];
  if (slides.length === 0) warnings.push("The PPTX presentation contained no slides.");
  return { blocks, ...(title ? { title } : {}), warnings };
}
