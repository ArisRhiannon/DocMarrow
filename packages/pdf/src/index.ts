import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { FigureRef, PageInput, Rule, TextItem } from "@docmarrow/core";
import { extractImages } from "./images.js";
import { extractRules } from "./rules.js";

/** Subset of a pdf.js text item we rely on. */
interface RawTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
}

export interface ExtractOptions {
  /** Password for encrypted PDFs. */
  password?: string;
}

/** Result of extracting a PDF: positioned pages plus document-level metadata. */
export interface PdfExtraction {
  pages: PageInput[];
  /** Document title from the PDF info dictionary / XMP, when present. */
  title?: string;
}

/** True if a font name signals a bold/italic/monospace style. */
function styleFromName(name: string): { bold: boolean; italic: boolean; mono: boolean } {
  const n = name.toLowerCase();
  return {
    bold: /bold|black|heavy|semibold|demibold/.test(n),
    italic: /italic|oblique/.test(n),
    mono: /mono|courier|consol|menlo|inconsolata|sourcecode|source code|typewriter|cour\b/.test(n),
  };
}

/**
 * Extract positioned text from a PDF using pdf.js.
 *
 * Coordinates are converted to docmarrow's convention: top-left origin, `y`
 * increasing downward. Returns one {@link PageInput} per page. Pure JS/WASM —
 * no native binaries.
 */
export async function extractPdf(
  data: Uint8Array,
  options: ExtractOptions = {},
): Promise<PdfExtraction> {
  // pdf.js may transfer (detach) the input ArrayBuffer to its worker, which
  // would neuter the caller's Uint8Array and break any reuse (e.g. parsing the
  // same bytes twice). Hand pdf.js a private copy so the caller's buffer is safe.
  const doc = await getDocument({
    data: data.slice(),
    isEvalSupported: false,
    useSystemFonts: true,
    ...(options.password ? { password: options.password } : {}),
  }).promise;

  let title: string | undefined;
  try {
    const meta = await doc.getMetadata();
    const info = meta?.info as { Title?: unknown } | undefined;
    if (info && typeof info.Title === "string" && info.Title.trim()) {
      title = info.Title.trim();
    }
  } catch {
    // Metadata is optional; ignore extraction failures.
  }

  const pages: PageInput[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      // getTextContent alone does NOT resolve embedded fonts, so bold/italic are
      // unknown. Building the operator list populates page.commonObjs with the
      // real font objects (no rasterization / canvas needed) and also gives us
      // the vector paths from which table rules are extracted. Best-effort.
      let rules: Rule[] = [];
      let figures: FigureRef[] = [];
      try {
        const opList = await page.getOperatorList();
        rules = extractRules(opList, viewport.height);
        figures = extractImages(opList, viewport.height, n);
      } catch {
        // Fonts fall back to the generic family; no rules/figures extracted.
      }
      const content = await page.getTextContent();
      const styles = content.styles as Record<string, { fontFamily?: string } | undefined>;

      const fontCache = new Map<string, { bold: boolean; italic: boolean; mono: boolean }>();
      const resolveFont = (name: string): { bold: boolean; italic: boolean; mono: boolean } => {
        if (!name) return { bold: false, italic: false, mono: false };
        const cached = fontCache.get(name);
        if (cached) return cached;
        const family = styles[name]?.fontFamily ?? "";
        let info = { bold: false, italic: false, mono: /mono/i.test(family) };
        try {
          const font = page.commonObjs.get(name) as
            | { name?: string; bold?: boolean; italic?: boolean }
            | null;
          if (font) {
            const fromName = font.name ? styleFromName(font.name) : info;
            info = {
              bold: font.bold ?? fromName.bold,
              italic: font.italic ?? fromName.italic,
              mono: info.mono || fromName.mono,
            };
          }
        } catch {
          // Font object not resolved; keep the family-derived fallback.
        }
        fontCache.set(name, info);
        return info;
      };

      const items: TextItem[] = [];
      for (const entry of content.items) {
        if (!("str" in entry)) continue;
        const raw = entry as RawTextItem;
        if (!raw.str) continue;
        const t = raw.transform;
        const fontSize = Math.hypot(t[0]!, t[1]!) || raw.height || 0;
        const height = raw.height || fontSize;
        const style = resolveFont(raw.fontName);
        items.push({
          text: raw.str,
          x: t[4]!,
          y: viewport.height - t[5]! - height,
          width: raw.width,
          height,
          fontSize,
          fontName: raw.fontName,
          bold: style.bold,
          italic: style.italic,
          mono: style.mono,
        });
      }

      pages.push({
        width: viewport.width,
        height: viewport.height,
        items,
        ...(rules.length ? { rules } : {}),
        ...(figures.length ? { figures } : {}),
      });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return { pages, ...(title ? { title } : {}) };
}
