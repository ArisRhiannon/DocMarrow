import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/index.js";
import { makePng } from "./png.js";

/** A digital PDF with a real embedded PNG drawn above a line of body text. */
async function pdfWithImage(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([400, 500]);
  const png = await pdf.embedPng(makePng(8, 8));
  page.drawImage(png, { x: 60, y: 280, width: 220, height: 140 });
  page.drawText("Caption-ish line below the chart.", { x: 60, y: 120, size: 12, font });
  return pdf.save();
}

describe("PDF figure extraction (end-to-end)", () => {
  it("emits a FigureBlock for an embedded image with a stable per-page ref", async () => {
    const doc = await parseDocument(await pdfWithImage());
    const figures = doc.blocks.filter((b) => b.type === "figure");
    expect(figures).toHaveLength(1);
    const fig = figures[0]!;
    expect(fig.type).toBe("figure");
    if (fig.type === "figure") {
      expect(fig.ref).toMatch(/^p1-img\d+$/);
      expect(fig.alt).toBe(""); // no describer supplied
      expect(fig.bytes).toBeUndefined(); // PDF pixels are not decoded (opt-in)
      // bbox roughly matches where we drew it (top-left origin, ~y=80..220).
      expect(fig.bbox.width).toBeGreaterThan(100);
      expect(fig.bbox.height).toBeGreaterThan(80);
    }
  });

  it("renders the figure as a Markdown image placeholder", async () => {
    const doc = await parseDocument(await pdfWithImage());
    expect(doc.markdown).toContain("![](p1-img1)");
  });

  it("ignores sub-16pt images as noise", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([400, 500]);
    const png = await pdf.embedPng(makePng(4, 4));
    page.drawImage(png, { x: 10, y: 10, width: 6, height: 6 }); // tiny spacer
    const doc = await parseDocument(await pdf.save());
    expect(doc.blocks.some((b) => b.type === "figure")).toBe(false);
  });
});

describe("describeImage hook", () => {
  const html = (img: string) => new TextEncoder().encode(`<body><p>Intro.</p>${img}</body>`);

  it("fills empty alt text and serializes the caption into Markdown (HTML)", async () => {
    const doc = await parseDocument(html(`<img src="x.png" alt="">`), {
      describeImage: { describe: async (i) => `caption for ${i.ref} (${i.mime})` },
    });
    const fig = doc.blocks.find((b) => b.type === "figure");
    expect(fig?.type === "figure" && fig.alt).toBe("caption for x.png (image/png)");
    expect(doc.markdown).toContain("![caption for x.png (image/png)](x.png)");
  });

  it("never overwrites source alt text (and skips calling the describer)", async () => {
    const calls: string[] = [];
    const doc = await parseDocument(html(`<img src="x.png" alt="Author's own caption">`), {
      describeImage: {
        describe: async (i) => {
          calls.push(i.ref);
          return "robot caption";
        },
      },
    });
    const fig = doc.blocks.find((b) => b.type === "figure");
    expect(fig?.type === "figure" && fig.alt).toBe("Author's own caption");
    expect(calls).toEqual([]);
  });

  it("describes PDF figures, which arrive with page/bbox but no bytes", async () => {
    let seenBytes: Uint8Array | undefined = new Uint8Array([1]);
    const doc = await parseDocument(await pdfWithImage(), {
      describeImage: {
        describe: async (i) => {
          seenBytes = i.bytes;
          return `figure on page ${i.page}`;
        },
      },
    });
    const fig = doc.blocks.find((b) => b.type === "figure");
    expect(fig?.type === "figure" && fig.alt).toBe("figure on page 1");
    expect(seenBytes).toBeUndefined();
  });

  it("leaves the figure undescribed when the describer throws (non-fatal)", async () => {
    const doc = await parseDocument(html(`<img src="x.png" alt="">`), {
      describeImage: {
        describe: async () => {
          throw new Error("vlm down");
        },
      },
    });
    const fig = doc.blocks.find((b) => b.type === "figure");
    expect(fig?.type === "figure" && fig.alt).toBe("");
  });
});
