# docparse-ts

Layout-aware PDF → Markdown + JSON + RAG chunks. TypeScript-native, no Python,
no servers.

```bash
npm install docparse-ts
```

```ts
import { parseDocument } from "docparse-ts";
import { readFile } from "node:fs/promises";

const doc = await parseDocument(new Uint8Array(await readFile("report.pdf")));
console.log(doc.markdown);
const chunks = doc.chunks({ maxTokens: 512, overlap: 64 });
```

`doc` exposes `markdown`, `blocks`, `json`, `pages`, and `chunks()`. A CLI is
included:

```bash
npx docparse-ts report.pdf -o report.md --json report.json
```

This is a self-contained package (the layout core and the `pdfjs-dist` backend
are bundled in). See the [project README](https://github.com/ArisRhiannon/docparse#readme)
for the full API, how it works, and current limitations (digital PDFs only;
basic geometric tables; no OCR).

Dual-licensed: AGPL-3.0-or-later or a commercial license.
