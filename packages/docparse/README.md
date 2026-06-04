# docparse

Layout-aware PDF → Markdown + JSON + RAG chunks. TypeScript-native, no Python,
no servers.

```ts
import { parseDocument } from "docparse";
import { readFile } from "node:fs/promises";

const doc = await parseDocument(new Uint8Array(await readFile("report.pdf")));
console.log(doc.markdown);
const chunks = doc.chunks({ maxTokens: 512, overlap: 64 });
```

`doc` exposes `markdown`, `blocks`, `json`, `pages`, and `chunks()`.

This is the main entry point; it wires the [`@docparse/pdf`](https://www.npmjs.com/package/@docparse/pdf)
extraction backend into the [`@docparse/core`](https://www.npmjs.com/package/@docparse/core)
analysis pipeline. See the [project README](https://github.com/ArisRhiannon/docparse#readme)
for the full API, how it works, and current limitations (digital PDFs only;
basic geometric tables; no OCR).

Dual-licensed: AGPL-3.0-or-later or a commercial license.
