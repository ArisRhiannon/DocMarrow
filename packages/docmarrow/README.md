# DocMarrow

**Pure TypeScript document parser for PDF → Markdown, JSON and RAG chunks.**

Layout-aware parsing of **PDF, DOCX, XLSX, PPTX and HTML** with no Python and no
servers — runs in Node, the browser and edge runtimes. Optional OCR for scanned
PDFs via [`@docmarrow/ocr`](https://www.npmjs.com/package/@docmarrow/ocr).

```bash
npm install docmarrow
```

```ts
import { parseDocument } from "docmarrow";
import { readFile } from "node:fs/promises";

// Format (PDF or DOCX) is autodetected from the bytes.
const doc = await parseDocument(new Uint8Array(await readFile("report.pdf")));
console.log(doc.markdown);
console.log(doc.meta); // { format, pageCount, hasText, title?, warnings[] }

const chunks = doc.chunks({ maxTokens: 512, overlap: 64 });
```

`doc` exposes `markdown`, `blocks`, `json`, `pages`, `meta`, and `chunks()`.
Block types: `heading`, `paragraph`, `list`, `table`, `code`, `quote`. A CLI is
included:

```bash
npx docmarrow report.pdf -o report.md --json report.json
npx docmarrow notes.docx -o notes.md
```

This is a self-contained package (the layout core, the `pdfjs-dist` PDF backend
and the OOXML DOCX backend are bundled in). See the
[project README](https://github.com/ArisRhiannon/DocMarrow#readme) for the full
API, how it works, the in-browser playground, and current limitations (digital
PDFs and DOCX; no OCR; geometric PDF tables).

Dual-licensed: AGPL-3.0-or-later or a commercial license.
