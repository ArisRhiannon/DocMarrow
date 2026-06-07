import { attr, childrenNamed, deepFirst, firstChild, parseXml } from "@docmarrow/ooxml";

/**
 * Minimal numeric-format application for XLSX, driven by `xl/styles.xml`.
 *
 * We are deliberately conservative: only clear date/time and percent formats are
 * applied (the highest-value cases — a date serial like `45000` is meaningless as
 * raw text). Everything else (currency, thousands, custom codes) is left as the
 * stored value, so we never mangle a number we are unsure about.
 */
export interface Styles {
  /** cellXfs index -> numFmtId. */
  xfNumFmt: number[];
  /** custom numFmtId (>=164) -> format code. */
  customCodes: Map<number, string>;
}

export const EMPTY_STYLES: Styles = { xfNumFmt: [], customCodes: new Map() };

export function parseStyles(xml: string | undefined): Styles {
  if (!xml) return EMPTY_STYLES;
  const ss = deepFirst(parseXml(xml), "styleSheet");
  if (!ss) return EMPTY_STYLES;
  const customCodes = new Map<number, string>();
  const numFmts = firstChild(ss, "numFmts");
  for (const nf of numFmts ? childrenNamed(numFmts, "numFmt") : []) {
    const id = Number(attr(nf, "numFmtId"));
    const code = attr(nf, "formatCode");
    if (Number.isFinite(id) && code !== undefined) customCodes.set(id, code);
  }
  const cellXfs = firstChild(ss, "cellXfs");
  const xfNumFmt = (cellXfs ? childrenNamed(cellXfs, "xf") : []).map(
    (xf) => Number(attr(xf, "numFmtId") ?? "0") || 0,
  );
  return { xfNumFmt, customCodes };
}

type Kind =
  | { kind: "date" }
  | { kind: "datetime" }
  | { kind: "time" }
  | { kind: "percent"; decimals: number }
  | { kind: "general" };

// Built-in numFmtIds (ECMA-376 §18.8.30).
const DATE_IDS = new Set([14, 15, 16, 17]);
const TIME_IDS = new Set([18, 19, 20, 21, 45, 46, 47]);
const DATETIME_IDS = new Set([22]);
const PERCENT_IDS = new Map([
  [9, 0],
  [10, 2],
]);

function classify(styleIndex: number | undefined, styles: Styles): Kind {
  if (styleIndex === undefined) return { kind: "general" };
  const id = styles.xfNumFmt[styleIndex];
  if (id === undefined) return { kind: "general" };
  if (DATE_IDS.has(id)) return { kind: "date" };
  if (DATETIME_IDS.has(id)) return { kind: "datetime" };
  if (TIME_IDS.has(id)) return { kind: "time" };
  const pct = PERCENT_IDS.get(id);
  if (pct !== undefined) return { kind: "percent", decimals: pct };

  const code = styles.customCodes.get(id);
  if (code) {
    // Drop colour/condition brackets and quoted literals before sniffing tokens.
    const c = code.replace(/\[[^\]]*\]/g, "").replace(/"[^"]*"/g, "");
    if (/%/.test(c)) return { kind: "percent", decimals: /\.([0#]+)/.exec(c)?.[1]?.length ?? 0 };
    const hasDate = /[yd]/i.test(c) || /m{3,}/.test(c);
    const hasTime = /[hs]/i.test(c);
    if (hasDate && hasTime) return { kind: "datetime" };
    if (hasDate) return { kind: "date" };
    if (hasTime) return { kind: "time" };
  }
  return { kind: "general" };
}

/** Excel serial day -> UTC Date (25569 = days from the Excel epoch to 1970-01-01). */
function serialToDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400000));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function timeOfDay(serial: number): string {
  let secs = Math.round((serial - Math.floor(serial)) * 86400);
  const h = Math.floor(secs / 3600);
  secs %= 3600;
  return `${pad(h)}:${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
}

/**
 * Format a numeric cell's stored value per its style. Returns the formatted
 * string, or the raw value when the format is general / unrecognised.
 */
export function formatNumeric(raw: string, styleIndex: number | undefined, styles: Styles): string {
  const num = Number(raw);
  if (!Number.isFinite(num)) return raw;
  const fmt = classify(styleIndex, styles);
  switch (fmt.kind) {
    case "date":
      return serialToDate(num).toISOString().slice(0, 10);
    case "datetime":
      return serialToDate(num).toISOString().slice(0, 19).replace("T", " ");
    case "time":
      return timeOfDay(num);
    case "percent":
      return `${(num * 100).toFixed(fmt.decimals)}%`;
    default:
      return raw;
  }
}
