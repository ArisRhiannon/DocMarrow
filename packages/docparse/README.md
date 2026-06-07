# docparse-ts

Layout-aware **PDF & DOCX** → Markdown + JSON + RAG chunks. TypeScript-native,
no Python, no servers. Runs in Node, the browser and edge runtimes.

```bash
npm install docparse-ts
```

```ts
import { parseDocument } from "docparse-ts";
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
npx docparse-ts report.pdf -o report.md --json report.json
npx docparse-ts notes.docx -o notes.md
```

This is a self-contained package (the layout core, the `pdfjs-dist` PDF backend
and the OOXML DOCX backend are bundled in). See the
[project README](https://github.com/ArisRhiannon/docparse-ts#readme) for the full
API, how it works, the in-browser playground, and current limitations (digital
PDFs and DOCX; no OCR; geometric PDF tables).

Dual-licensed: AGPL-3.0-or-later or a commercial license.
