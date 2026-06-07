# @docparse/pdf

> Internal workspace module — **not published to npm**. It is bundled into the
> [`docparse-ts`](https://www.npmjs.com/package/docparse-ts) package at build time.

The [`pdfjs-dist`](https://github.com/mozilla/pdf.js) extraction backend for
[`docparse-ts`](https://github.com/ArisRhiannon/docparse-ts#readme). It reads a PDF
and emits positioned text items per page (plus the document title) for the core
pipeline, converting pdf.js coordinates into docparse's top-left convention and
resolving bold/italic/monospace from the embedded fonts.

```ts
import { extractPdf } from "@docparse/pdf";
import { analyze, toMarkdown } from "@docparse/core";

const { pages, title } = await extractPdf(bytes); // bytes: Uint8Array
const markdown = toMarkdown(analyze(pages).blocks);
```

Digital (text-based) PDFs only — no OCR. Most users should use the
[`docparse-ts`](https://www.npmjs.com/package/docparse-ts) package, which wires
this in automatically.

Dual-licensed: AGPL-3.0-or-later or a commercial license.
