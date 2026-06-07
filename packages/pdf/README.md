# @docmarrow/pdf

> Internal workspace module — **not published to npm**. It is bundled into the
> [`docmarrow`](https://www.npmjs.com/package/docmarrow) package at build time.

The [`pdfjs-dist`](https://github.com/mozilla/pdf.js) extraction backend for
[`docmarrow`](https://github.com/ArisRhiannon/DocMarrow#readme). It reads a PDF
and emits positioned text items per page (plus the document title) for the core
pipeline, converting pdf.js coordinates into docmarrow's top-left convention and
resolving bold/italic/monospace from the embedded fonts.

```ts
import { extractPdf } from "@docmarrow/pdf";
import { analyze, toMarkdown } from "@docmarrow/core";

const { pages, title } = await extractPdf(bytes); // bytes: Uint8Array
const markdown = toMarkdown(analyze(pages).blocks);
```

Digital (text-based) PDFs only — no OCR. Most users should use the
[`docmarrow`](https://www.npmjs.com/package/docmarrow) package, which wires
this in automatically.

Dual-licensed: AGPL-3.0-or-later or a commercial license.
