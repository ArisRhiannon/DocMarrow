import { describe, expect, it } from "vitest";
import { PDFDocument, rgb } from "pdf-lib";
import { parseDocument, type OcrEngine, type TextItem } from "../src/index.js";

/** A PDF page with no text (image-only / scanned analogue). */
async function scannedPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  page.drawRectangle({ x: 80, y: 600, width: 300, height: 120, color: rgb(0.85, 0.85, 0.85) });
  return pdf.save();
}

/** A fake OCR engine: returns canned positioned words for the requested pages,
 *  exercising the parseDocument({ ocr }) wiring without a real OCR runtime. */
const mockOcr: OcrEngine = {
  async ocrPages(_pdf, pageNumbers) {
    const mk = (text: string, x: number, y: number, fontSize: number): TextItem => ({
      text,
      x,
      y,
      width: text.length * fontSize * 0.5,
      height: fontSize,
      fontSize,
      bold: false,
      italic: false,
      mono: false,
    });
    const result = new Map<number, TextItem[]>();
    for (const n of pageNumbers) {
      result.set(n, [
        mk("Scanned Title", 50, 60, 24),
        mk("Recovered body text from OCR on a scanned page.", 50, 120, 12),
      ]);
    }
    return result;
  },
};

describe("parseDocument OCR integration", () => {
  it("leaves a scanned page empty and warns when no OCR engine is given", async () => {
    const doc = await parseDocument(await scannedPdf());
    expect(doc.meta.hasText).toBe(false);
    expect(doc.meta.warnings.some((w) => /no extractable text/i.test(w))).toBe(true);
  });

  it("fills scanned pages via a supplied OCR engine and runs the normal pipeline", async () => {
    const doc = await parseDocument(await scannedPdf(), { ocr: mockOcr });
    expect(doc.meta.hasText).toBe(true);
    expect(doc.markdown).toContain("# Scanned Title");
    expect(doc.markdown).toContain("Recovered body text from OCR");
    expect(doc.meta.warnings).toEqual([]);
  });

  it("does not call OCR for pages that already have text", async () => {
    // A normal text PDF: the OCR engine should never be invoked.
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont((await import("pdf-lib")).StandardFonts.Helvetica);
    page.drawText("Already has text", { x: 50, y: 800, size: 14, font });
    let called = false;
    const spy: OcrEngine = {
      async ocrPages(pdfBytes, pages) {
        called = true;
        return mockOcr.ocrPages(pdfBytes, pages);
      },
    };
    const doc = await parseDocument(await pdf.save(), { ocr: spy });
    expect(called).toBe(false);
    expect(doc.markdown).toContain("Already has text");
  });
});
