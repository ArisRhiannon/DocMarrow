import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createWorker } from "tesseract.js";
import type { OcrEngine, TextItem } from "@docmarrow/core";
import { loadRaster } from "./canvas.js";

export interface OcrEngineOptions {
  /** Tesseract language(s), e.g. "eng" or "eng+spa". Default: "eng". */
  lang?: string;
  /** Render scale before OCR; higher is slower but more accurate. Default: 3. */
  scale?: number;
  /** Drop words below this confidence (0–100). Default: 40. */
  minConfidence?: number;
  /**
   * Path/URL to pdf.js standard font data (the `standard_fonts/` directory),
   * needed to rasterize pages that draw text with the standard-14 fonts. Not
   * required for purely image-based (scanned) pages.
   */
  standardFontDataUrl?: string;
}

interface TWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** Flatten tesseract's block→paragraph→line→word tree into words. */
function collectWords(data: unknown): TWord[] {
  const words: TWord[] = [];
  const blocks = (data as { blocks?: unknown[] }).blocks ?? [];
  for (const b of blocks as Array<{ paragraphs?: unknown[] }>) {
    for (const p of b.paragraphs ?? []) {
      for (const l of (p as { lines?: unknown[] }).lines ?? []) {
        for (const w of (l as { words?: TWord[] }).words ?? []) words.push(w);
      }
    }
  }
  return words;
}

/**
 * Create a tesseract.js-backed {@link OcrEngine} for docmarrow.
 *
 * Pass it to `parseDocument(bytes, { ocr })`; scanned/image-only PDF pages are
 * rendered to a bitmap and OCR'd, and the recognized words (with positions) are
 * fed into the normal layout pipeline. A fresh tesseract worker is created and
 * terminated per call, so the engine is stateless and leak-free.
 *
 * Node needs the optional `@napi-rs/canvas` dependency for rasterization; in the
 * browser the DOM canvas is used (and the app must configure the pdf.js worker).
 */
export function createOcrEngine(options: OcrEngineOptions = {}): OcrEngine {
  const lang = options.lang ?? "eng";
  const scale = options.scale ?? 3;
  const minConfidence = options.minConfidence ?? 40;

  return {
    async ocrPages(pdf: Uint8Array, pageNumbers: number[]): Promise<Map<number, TextItem[]>> {
      const out = new Map<number, TextItem[]>();
      if (pageNumbers.length === 0) return out;

      const raster = await loadRaster();
      const worker = await createWorker(lang);
      const doc = await getDocument({
        data: pdf.slice(),
        isEvalSupported: false,
        ...(options.standardFontDataUrl
          ? { standardFontDataUrl: options.standardFontDataUrl }
          : {}),
      }).promise;

      try {
        for (const n of pageNumbers) {
          if (n < 1 || n > doc.numPages) continue;
          const page = await doc.getPage(n);
          const viewport = page.getViewport({ scale });
          const bundle = raster.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
          await page.render({ canvasContext: bundle.ctx, viewport }).promise;

          const image = raster.toOcrImage(bundle);
          // 3rd arg selects structured output (blocks) so we get word boxes.
          const { data } = await worker.recognize(image as never, {}, { blocks: true });

          const items: TextItem[] = [];
          for (const w of collectWords(data)) {
            const text = w.text?.trim();
            if (!text || w.confidence < minConfidence) continue;
            const x = w.bbox.x0 / scale;
            const y = w.bbox.y0 / scale;
            const height = (w.bbox.y1 - w.bbox.y0) / scale;
            items.push({
              text,
              x,
              y,
              width: (w.bbox.x1 - w.bbox.x0) / scale,
              height,
              fontSize: height,
              bold: false,
              italic: false,
              mono: false,
            });
          }
          out.set(n, items);
          page.cleanup();
        }
      } finally {
        await worker.terminate();
        await doc.destroy();
      }
      return out;
    },
  };
}

export { loadRaster } from "./canvas.js";
