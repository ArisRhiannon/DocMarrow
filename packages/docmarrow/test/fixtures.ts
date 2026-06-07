import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

/**
 * Programmatic PDF fixtures for varied parsing scenarios. Building them with
 * pdf-lib keeps the corpus reproducible and dependency-free (no binary blobs
 * checked in), and exercises the real pdfjs extraction path end to end.
 */

const A4: [number, number] = [595, 842];

async function fonts(pdf: PDFDocument): Promise<Record<string, PDFFont>> {
  return {
    body: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };
}

/** Full-width title above two independent prose columns. */
export async function multiColumnPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(A4);
  const f = await fonts(pdf);
  page.drawText("The Full Width Title", { x: 50, y: 800, size: 22, font: f.bold });
  const left = ["Left column line one here", "left column line two here", "left column line three"];
  const right = ["Right column line one here", "right column line two here", "right column line three"];
  left.forEach((t, i) => page.drawText(t, { x: 50, y: 750 - i * 16, size: 11, font: f.body }));
  // Offset the right column's baselines: real multi-column prose wraps
  // independently, so columns do not share baselines (unlike a table grid).
  right.forEach((t, i) => page.drawText(t, { x: 320, y: 742 - i * 16, size: 11, font: f.body }));
  return pdf.save();
}

/** A dense aligned grid (whitespace-separated table). */
export async function tablePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(A4);
  const f = await fonts(pdf);
  const rows = [
    ["Product", "Region", "Units"],
    ["Widget", "North", "120"],
    ["Gadget", "South", "98"],
    ["Gizmo", "East", "204"],
  ];
  const xs = [50, 230, 410];
  rows.forEach((row, r) =>
    row.forEach((cell, c) =>
      page.drawText(cell, { x: xs[c]!, y: 760 - r * 18, size: 11, font: f.body }),
    ),
  );
  return pdf.save();
}

/** Ordered list with an indented nested level. */
export async function nestedListPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(A4);
  const f = await fonts(pdf);
  const lines: Array<[string, number]> = [
    ["1. First top-level item", 50],
    ["2. Second top-level item", 50],
    ["a. Nested item under two", 72],
    ["b. Another nested item", 72],
    ["3. Third top-level item", 50],
  ];
  lines.forEach(([t, x], i) => page.drawText(t, { x, y: 760 - i * 18, size: 11, font: f.body }));
  return pdf.save();
}

/** Three pages sharing a running header and footer page numbers. */
export async function headerFooterPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const f = await fonts(pdf);
  for (let n = 1; n <= 3; n++) {
    const page = pdf.addPage(A4);
    page.drawText("ACME Confidential Report", { x: 50, y: 812, size: 9, font: f.body });
    page.drawText(`Body paragraph unique to page ${n} of the document.`, {
      x: 50,
      y: 420,
      size: 11,
      font: f.body,
    });
    page.drawText(String(n), { x: 297, y: 24, size: 9, font: f.body });
  }
  return pdf.save();
}

/** Heading, paragraph, list and table together on one page. */
export async function mixedPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(A4);
  const f = await fonts(pdf);
  page.drawText("Mixed Content", { x: 50, y: 800, size: 20, font: f.bold });
  page.drawText("An introductory paragraph of ordinary body text on the page.", {
    x: 50,
    y: 760,
    size: 11,
    font: f.body,
  });
  ["- alpha point", "- beta point"].forEach((t, i) =>
    page.drawText(t, { x: 50, y: 720 - i * 16, size: 11, font: f.body }),
  );
  const grid = [
    ["Key", "Value"],
    ["Speed", "Fast"],
  ];
  grid.forEach((row, r) =>
    row.forEach((c, ci) =>
      page.drawText(c, { x: 50 + ci * 180, y: 670 - r * 16, size: 11, font: f.body }),
    ),
  );
  return pdf.save();
}

/** A page with no text at all (image-only / scanned analogue). */
export async function emptyPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(A4);
  page.drawRectangle({ x: 100, y: 100, width: 200, height: 200, color: rgb(0.9, 0.9, 0.9) });
  return pdf.save();
}

/** A run of monospace (Courier) lines that should read as a code block. */
export async function codePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(A4);
  const f = await fonts(pdf);
  page.drawText("Example", { x: 50, y: 800, size: 18, font: f.bold });
  const code = ["function add(a, b) {", "  return a + b;", "}"];
  code.forEach((t, i) => page.drawText(t, { x: 50, y: 760 - i * 14, size: 11, font: f.mono }));
  return pdf.save();
}

/** An italic, indented run that should read as a block quote. */
export async function quotePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(A4);
  const f = await fonts(pdf);
  page.drawText("A normal paragraph sitting at the left margin of the page.", {
    x: 50,
    y: 780,
    size: 11,
    font: f.body,
  });
  const quote = ["The only thing we have to fear", "is fear itself, said the speaker."];
  quote.forEach((t, i) => page.drawText(t, { x: 110, y: 730 - i * 16, size: 11, font: f.italic }));
  return pdf.save();
}

/**
 * A table drawn with real border lines, with multi-word cells. The geometric
 * detector would split "Item Name" at its internal space into two columns; the
 * ruled detector uses the borders, so the cell stays intact.
 */
export async function ruledTablePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(A4);
  const f = await fonts(pdf);
  const black = rgb(0, 0, 0);
  const cols = [50, 200, 350, 500];
  const rowTops = [760, 730, 700, 670]; // pdf-lib bottom-up coords
  const line = (sx: number, sy: number, ex: number, ey: number): void =>
    page.drawLine({ start: { x: sx, y: sy }, end: { x: ex, y: ey }, thickness: 1, color: black });
  for (const y of rowTops) line(cols[0]!, y, cols[cols.length - 1]!, y);
  for (const x of cols) line(x, rowTops[rowTops.length - 1]!, x, rowTops[0]!);

  const data = [
    ["Item Name", "Unit Price", "In Stock"],
    ["Widget Pro", "12 USD", "Yes"],
    ["Mega Gadget", "8 USD", "No"],
  ];
  data.forEach((row, r) =>
    row.forEach((cell, c) =>
      page.drawText(cell, { x: cols[c]! + 8, y: rowTops[r]! - 18, size: 11, font: f.body }),
    ),
  );
  return pdf.save();
}
