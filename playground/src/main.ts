// Configure the pdf.js worker (same pdfjs-dist instance the bundled backend uses,
// thanks to resolve.dedupe in vite.config.ts) before any PDF is parsed.
import "./style.css";
import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;

import { parseDocument, type ParsedDocument } from "docparse-ts";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { strToU8, zipSync } from "fflate";

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T;

const statusEl = $("#status");
const outEl = $<HTMLPreElement>("#out");
const metaEl = $<HTMLDListElement>("#meta");

let current: ParsedDocument | null = null;
let view: "markdown" | "json" | "chunks" = "markdown";

function setStatus(msg: string, kind: "" | "error" | "busy" = ""): void {
  statusEl.textContent = msg;
  statusEl.className = `status ${kind}`;
}

function renderMeta(doc: ParsedDocument): void {
  const rows: Array<[string, string]> = [
    ["format", doc.meta.format],
    ["pages", String(doc.meta.pageCount)],
    ["title", doc.meta.title ?? "—"],
    ["blocks", String(doc.blocks.length)],
    ["warnings", doc.meta.warnings.length ? doc.meta.warnings.join("; ") : "none"],
  ];
  metaEl.innerHTML = rows
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`)
    .join("");
  metaEl.hidden = false;
}

function renderView(): void {
  if (!current) return;
  if (view === "markdown") {
    outEl.textContent = current.markdown;
  } else if (view === "json") {
    outEl.textContent = JSON.stringify(current.json, null, 2);
  } else {
    const chunks = current.chunks({ maxTokens: 256, overlap: 32 });
    outEl.textContent = chunks
      .map(
        (c, i) =>
          `# chunk ${i + 1} · ~${c.tokens} tokens · pages ${c.pages.join(",")} · ${
            c.path.join(" › ") || "(root)"
          }\n${c.text}`,
      )
      .join("\n\n" + "─".repeat(40) + "\n\n");
  }
}

async function run(bytes: Uint8Array, label: string): Promise<void> {
  setStatus(`Parsing ${label} …`, "busy");
  try {
    current = await parseDocument(bytes);
    renderMeta(current);
    renderView();
    setStatus(`Parsed ${label} (${current.blocks.length} blocks) — entirely client-side.`);
  } catch (err) {
    current = null;
    metaEl.hidden = true;
    outEl.textContent = "";
    setStatus(err instanceof Error ? err.message : String(err), "error");
  }
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

// --- sample builders (so the playground works with zero input) ---------------

async function samplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText("Quarterly Report", { x: 50, y: 790, size: 24, font: bold });
  page.drawText("Summary", { x: 50, y: 752, size: 16, font: bold });
  [
    "Revenue grew across every region this quarter, with the",
    "strongest performance in the northern market.",
  ].forEach((t, i) => page.drawText(t, { x: 50, y: 726 - i * 15, size: 11, font: body }));
  ["- Revenue up 18%", "- Costs down 4%"].forEach((t, i) =>
    page.drawText(t, { x: 50, y: 686 - i * 16, size: 11, font: body }),
  );
  return pdf.save();
}

function sampleDocx(): Uint8Array {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const document = `<w:document ${W}><w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Design Notes</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Goals</w:t></w:r></w:p>
    <w:p><w:r><w:t>A Word document parsed entirely in the browser.</w:t></w:r></w:p>
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

// --- wiring ------------------------------------------------------------------

const fileInput = $<HTMLInputElement>("#file");
const drop = $("#drop");

$("#pick").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (file) await run(new Uint8Array(await file.arrayBuffer()), file.name);
});

drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", async (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  const file = e.dataTransfer?.files?.[0];
  if (file) await run(new Uint8Array(await file.arrayBuffer()), file.name);
});

$("#sample-pdf").addEventListener("click", async () => run(await samplePdf(), "sample.pdf"));
$("#sample-docx").addEventListener("click", () => run(sampleDocx(), "sample.docx"));

for (const tab of document.querySelectorAll<HTMLButtonElement>(".tab")) {
  tab.addEventListener("click", () => {
    view = tab.dataset.view as typeof view;
    for (const t of document.querySelectorAll(".tab")) t.setAttribute("aria-selected", "false");
    tab.setAttribute("aria-selected", "true");
    renderView();
  });
}
