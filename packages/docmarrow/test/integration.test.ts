import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { parseDocument, type ParsedDocument } from "../src/index.js";

/** Build a small but real digital PDF: title, a paragraph, and a bullet list. */
async function makePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);

  page.drawText("Quarterly Report", { x: 50, y: 790, size: 24, font: bold, color: black });
  const lines = [
    "This paragraph spans two lines so we can verify that wrapped",
    "lines are merged back into a single paragraph by docmarrow.",
  ];
  lines.forEach((t, i) =>
    page.drawText(t, { x: 50, y: 740 - i * 16, size: 12, font: body, color: black }),
  );
  const bullets = ["First key result", "Second key result", "Third key result"];
  bullets.forEach((t, i) =>
    page.drawText(`- ${t}`, { x: 50, y: 690 - i * 16, size: 12, font: body, color: black }),
  );

  return pdf.save();
}

describe("parseDocument (integration, real PDF)", () => {
  let doc: ParsedDocument;

  beforeAll(async () => {
    doc = await parseDocument(await makePdf());
  });

  it("extracts the title as a level-1 heading", () => {
    expect(doc.markdown).toContain("# Quarterly Report");
  });

  it("merges the wrapped paragraph into one block", () => {
    const paragraph = doc.blocks.find((b) => b.type === "paragraph");
    expect(paragraph && "text" in paragraph && paragraph.text).toContain(
      "wrapped lines are merged back into a single paragraph",
    );
  });

  it("detects the bullet list", () => {
    expect(doc.markdown).toContain("- First key result");
    const list = doc.blocks.find((b) => b.type === "list");
    expect(list && "items" in list && list.items).toHaveLength(3);
  });

  it("emits a JSON content tree with bbox and page metadata", () => {
    expect(doc.json.length).toBeGreaterThan(0);
    expect(doc.json[0]).toMatchObject({ page: 1 });
    expect(doc.json[0]!.bbox.width).toBeGreaterThan(0);
  });

  it("produces RAG chunks carrying the heading path", () => {
    const chunks = doc.chunks({ maxTokens: 256 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]!.path).toContain("Quarterly Report");
    expect(chunks[0]!.tokens).toBeGreaterThan(0);
  });

  it("rejects non-PDF input with a clear error", async () => {
    await expect(parseDocument(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/%PDF/);
  });

  it("exposes document metadata (format, pageCount, hasText)", () => {
    expect(doc.meta.format).toBe("pdf");
    expect(doc.meta.pageCount).toBe(1);
    expect(doc.meta.hasText).toBe(true);
    expect(Array.isArray(doc.meta.warnings)).toBe(true);
  });

  it("falls back to the first heading as the title when no embedded title exists", () => {
    expect(doc.meta.title).toBe("Quarterly Report");
  });

  it("does not detach the caller's buffer (same bytes can be parsed twice)", async () => {
    const bytes = await makePdf();
    const first = await parseDocument(bytes);
    // pdf.js can transfer the input buffer; we must hand it a copy so this works.
    const second = await parseDocument(bytes);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(second.markdown).toBe(first.markdown);
  });
});
