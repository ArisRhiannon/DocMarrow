// Shared sample builders so the examples are self-contained and need no input
// files. In real use you would pass your own PDF/DOCX bytes to parseDocument().
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { strToU8, zipSync } from "fflate";

export async function makeSamplePdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  page.drawText("Quarterly Report", { x: 50, y: 790, size: 24, font: bold, color: black });
  page.drawText("Summary", { x: 50, y: 750, size: 16, font: bold, color: black });
  [
    "Revenue grew across every region this quarter, with the strongest",
    "performance in the northern market and steady gains elsewhere.",
  ].forEach((t, i) =>
    page.drawText(t, { x: 50, y: 722 - i * 15, size: 11, font: body, color: black }),
  );
  ["- Revenue up 18%", "- Costs down 4%", "- Margin improved"].forEach((t, i) =>
    page.drawText(t, { x: 50, y: 680 - i * 16, size: 11, font: body, color: black }),
  );
  return pdf.save();
}

export function makeSampleDocx() {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const document = `<w:document ${W}><w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Design Notes</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Goals</w:t></w:r></w:p>
    <w:p><w:r><w:t>This is a Word document parsed entirely in JavaScript, no Office required.</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Be fast</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Be correct</w:t></w:r></w:p>
  </w:body></w:document>`;
  const styles = `<w:styles ${W}><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`;
  const numbering = `<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types/>'),
    "word/document.xml": strToU8(document),
    "word/styles.xml": strToU8(styles),
    "word/numbering.xml": strToU8(numbering),
  });
}
