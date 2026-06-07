// Reproducible timing benchmark for docparse-ts.
//
//   pnpm build && pnpm --filter @docparse/bench start
//
// This measures ONLY throughput/latency of the parse pipeline on synthetic
// fixtures, single-threaded, on whatever machine you run it on. It deliberately
// makes NO claims about extraction quality or comparisons to other tools — that
// would require a labelled corpus and ground truth, which this harness does not
// have. Treat the numbers as a relative performance smoke test, nothing more.
import { performance } from "node:perf_hooks";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { strToU8, zipSync } from "fflate";
import { parseDocument } from "docparse-ts";

const ITER = Number(process.env.ITER ?? 40);
const WARMUP = 5;

async function makePdf(pages) {
  const pdf = await PDFDocument.create();
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (let p = 0; p < pages; p++) {
    const page = pdf.addPage([595, 842]);
    page.drawText("Section " + (p + 1), { x: 50, y: 800, size: 18, font: bold });
    for (let i = 0; i < 35; i++) {
      page.drawText(`Line ${i} of body text used to exercise the layout pipeline.`, {
        x: 50,
        y: 770 - i * 20,
        size: 11,
        font: body,
      });
    }
    page.drawText("Confidential", { x: 50, y: 815, size: 8, font: body });
    page.drawText(String(p + 1), { x: 297, y: 22, size: 9, font: body });
  }
  return pdf.save();
}

function makeDocx(paras) {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  let body = `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Benchmark</w:t></w:r></w:p>`;
  for (let i = 0; i < paras; i++) {
    body += `<w:p><w:r><w:t>Paragraph ${i} of a Word document used for benchmarking the OOXML backend.</w:t></w:r></w:p>`;
  }
  const document = `<w:document ${W}><w:body>${body}</w:body></w:document>`;
  const styles = `<w:styles ${W}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`;
  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types/>'),
    "word/document.xml": strToU8(document),
    "word/styles.xml": strToU8(styles),
  });
}

const fmt = (n) => n.toFixed(2).padStart(8);
const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor((arr.length * p) / 100))];

async function bench(label, bytes, pages) {
  for (let i = 0; i < WARMUP; i++) await parseDocument(bytes);
  const times = [];
  for (let i = 0; i < ITER; i++) {
    const t0 = performance.now();
    await parseDocument(bytes);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = pct(times, 50);
  const p95 = pct(times, 95);
  const kb = bytes.length / 1024;
  console.log(
    `${label.padEnd(22)} ${fmt(median)} ms  p95 ${fmt(p95)} ms  ` +
      `${String(pages).padStart(3)} pg  ${fmt(kb)} KB  ${fmt(pages / (median / 1000))} pg/s`,
  );
}

console.log(`docparse-ts benchmark — Node ${process.version}, ${ITER} iterations (median + p95)\n`);
console.log("fixture                  median        p95         size            throughput");
console.log("-".repeat(80));
await bench("PDF 1 page", await makePdf(1), 1);
await bench("PDF 10 pages", await makePdf(10), 10);
await bench("PDF 50 pages", await makePdf(50), 50);
await bench("DOCX 50 paragraphs", makeDocx(50), 1);
await bench("DOCX 500 paragraphs", makeDocx(500), 1);
console.log("\nSynthetic fixtures, single thread. Timings only — no quality/accuracy claims.");
