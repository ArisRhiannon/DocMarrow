import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PageInput, TextItem } from "@docparse/core";

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

/** True if a font name signals a bold/italic style. */
function styleFromName(name: string): { bold: boolean; italic: boolean } {
  const n = name.toLowerCase();
  return {
    bold: /bold|black|heavy|semibold|demibold/.test(n),
    italic: /italic|oblique/.test(n),
  };
}

/**
 * Extract positioned text from a PDF using pdf.js.
 *
 * Coordinates are converted to docparse's convention: top-left origin, `y`
 * increasing downward. Returns one {@link PageInput} per page. Pure JS/WASM —
 * no native binaries.
 */
export async function extractPdf(
  data: Uint8Array,
  options: ExtractOptions = {},
): Promise<PageInput[]> {
  const doc = await getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
    ...(options.password ? { password: options.password } : {}),
  }).promise;

  const pages: PageInput[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();

      const fontCache = new Map<string, { bold: boolean; italic: boolean }>();
      const resolveFont = (name: string): { bold: boolean; italic: boolean } => {
        if (!name) return { bold: false, italic: false };
        const cached = fontCache.get(name);
        if (cached) return cached;
        let info = { bold: false, italic: false };
        try {
          const font = page.commonObjs.get(name) as { name?: string } | null;
          if (font?.name) info = styleFromName(font.name);
        } catch {
          // Font object not resolved; fall back to no style.
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
        });
      }

      pages.push({ width: viewport.width, height: viewport.height, items });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}
