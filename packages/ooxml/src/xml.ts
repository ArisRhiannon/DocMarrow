import { XMLParser } from "fast-xml-parser";

/**
 * A node in fast-xml-parser's `preserveOrder` output. Each element is an object
 * with exactly one tag key whose value is an ordered array of child nodes, an
 * optional `:@` attribute bag, and text leaves stored under `#text`. Document
 * order is preserved, which OOXML relies on (run order, block order, …).
 */
export type XmlNode = Record<string, unknown>;

const ATTR_KEY = ":@";
const TEXT_KEY = "#text";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  trimValues: false,
  // OOXML never uses these; keeping them off avoids surprises.
  parseTagValue: false,
  parseAttributeValue: false,
});

/** Parse an XML string into an ordered list of root nodes. */
export function parseXml(xml: string): XmlNode[] {
  return parser.parse(xml) as XmlNode[];
}

/** The tag name of an element node (`""` for a text-only node). */
export function tagName(node: XmlNode): string {
  for (const key of Object.keys(node)) {
    if (key !== ATTR_KEY && key !== TEXT_KEY) return key;
  }
  return "";
}

/** Ordered child nodes of an element. */
export function childrenOf(node: XmlNode): XmlNode[] {
  const value = node[tagName(node)];
  return Array.isArray(value) ? (value as XmlNode[]) : [];
}

/** Attribute value, e.g. `attr(n, "w:val")` reads `@_w:val`. */
export function attr(node: XmlNode, name: string): string | undefined {
  const bag = node[ATTR_KEY] as Record<string, unknown> | undefined;
  const raw = bag?.[`@_${name}`];
  return raw === undefined ? undefined : String(raw);
}

/** Literal text of a `#text` leaf, if this node is one. */
export function textOf(node: XmlNode): string | undefined {
  const raw = node[TEXT_KEY];
  return typeof raw === "string" ? raw : undefined;
}

/** First direct child named `name`. OOXML walking is order-sensitive, so these
 * shallow finders cover the common "look at my direct children" cases. */
export function firstChild(node: XmlNode, name: string): XmlNode | undefined {
  return childrenOf(node).find((c) => tagName(c) === name);
}

export function childrenNamed(node: XmlNode, name: string): XmlNode[] {
  return childrenOf(node).filter((c) => tagName(c) === name);
}

/** Find the first element with `name` anywhere in the subtree (pre-order). */
export function deepFirst(nodes: XmlNode[], name: string): XmlNode | undefined {
  for (const n of nodes) {
    if (tagName(n) === name) return n;
    const hit = deepFirst(childrenOf(n), name);
    if (hit) return hit;
  }
  return undefined;
}

/** Collect all `#text` under a subtree (optionally mapping certain tags). */
export function collectAllText(node: XmlNode, onTag?: (tag: string) => string | undefined): string {
  const tag = tagName(node);
  if (onTag) {
    const mapped = onTag(tag);
    if (mapped !== undefined) return mapped;
  }
  const own = textOf(node);
  if (own !== undefined) return own;
  return childrenOf(node).map((c) => collectAllText(c, onTag)).join("");
}
