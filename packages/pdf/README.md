# @docparse/pdf

> Internal workspace module — **not published to npm**. It is bundled into the
> [`docparse-ts`](https://www.npmjs.com/package/docparse-ts) package at build time.

The [`pdfjs-dist`](https://github.com/mozilla/pdf.js) extraction backend for
[`docparse`](https://github.com/ArisRhiannon/docparse#readme). It reads a PDF and
emits positioned text items per page (`PageInput[]`) for the core pipeline,
converting pdf.js coordinates into docparse's top-left convention.

```ts
import { extractPdf } from "@docparse/pdf";
import { analyze, toMarkdown } from "@docparse/core";

const pages = await extractPdf(bytes); // Uint8Array
const markdown = toMarkdown(analyze(pages).blocks);
```

Digital (text-based) PDFs only — no OCR. Most users should use the
[`docparse`](https://www.npmjs.com/package/docparse) package, which wires this in
automatically.

Dual-licensed: AGPL-3.0-or-later or a commercial license.
