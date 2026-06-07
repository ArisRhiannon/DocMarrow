import { describe, expect, it } from "vitest";
import { createOcrEngine } from "../src/index.js";

/**
 * Real OCR verification: builds an image-only PDF (text drawn into a PNG, no
 * text layer) and checks the tesseract engine recovers the text with positions.
 *
 * Gated behind DOCPARSE_OCR_TEST=1 because it pulls the native @napi-rs/canvas
 * and downloads the tesseract language model (~15MB) on first run — too heavy
 * for default CI. Run locally with:
 *
 *   DOCPARSE_OCR_TEST=1 pnpm --filter @docmarrow/ocr exec vitest run
 */
const RUN = process.env.DOCPARSE_OCR_TEST === "1";

/** A scanned-style PDF: a PNG of text embedded as an image, with no text layer. */
async function imageOnlyPdf(): Promise<Uint8Array> {
  const { createCanvas } = (await import("@napi-rs/canvas")) as typeof import("@napi-rs/canvas");
  const { PDFDocument } = await import("pdf-lib");
  const cv = createCanvas(640, 200);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 640, 200);
  ctx.fillStyle = "black";
  ctx.font = "40px sans-serif";
  ctx.fillText("Scanned Heading", 20, 70);
  ctx.fillText("Amount due 532 USD", 20, 140);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([320, 100]);
  const png = await pdf.embedPng(cv.toBuffer("image/png"));
  page.drawImage(png, { x: 0, y: 0, width: 320, height: 100 });
  return pdf.save();
}

describe.skipIf(!RUN)("createOcrEngine (real tesseract.js)", () => {
  it("recovers positioned text from an image-only PDF page", async () => {
    const engine = createOcrEngine({ scale: 3, lang: "eng" });
    const result = await engine.ocrPages(await imageOnlyPdf(), [1]);
    const items = result.get(1) ?? [];
    const text = items.map((i) => i.text).join(" ");
    expect(text).toMatch(/Scanned/i);
    expect(text).toMatch(/Heading/i);
    expect(text).toMatch(/532/);
    // Words carry sane positions (top-left points), not raster pixels.
    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const it of items) {
      expect(it.width).toBeGreaterThan(0);
      expect(it.height).toBeGreaterThan(0);
    }
  }, 120_000);
});

describe("createOcrEngine (shape)", () => {
  it("returns an OcrEngine with ocrPages and an empty result for no pages", async () => {
    const engine = createOcrEngine();
    expect(typeof engine.ocrPages).toBe("function");
    const empty = await engine.ocrPages(new Uint8Array([0]), []);
    expect(empty.size).toBe(0);
  });
});
