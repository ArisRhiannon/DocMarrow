# @docparse/ocr

Optional OCR engine for [`docparse-ts`](https://github.com/ArisRhiannon/docparse-ts),
backed by [tesseract.js](https://github.com/naptha/tesseract.js). It rasterizes
scanned/image-only PDF pages and recognizes their text (with positions), which
`docparse-ts` then runs through its normal layout pipeline.

**Opt-in by design.** This package is *not* bundled into `docparse-ts`: the core
stays pure JS with no native/heavy dependencies. You install OCR only if you need
it.

```bash
npm install docparse-ts @docparse/ocr
# Node also needs a canvas implementation to rasterize pages:
npm install @napi-rs/canvas
```

```ts
import { parseDocument } from "docparse-ts";
import { createOcrEngine } from "@docparse/ocr";

const doc = await parseDocument(bytes, { ocr: createOcrEngine({ lang: "eng", scale: 3 }) });
```

Only PDF pages with **no** extractable text are OCR'd; pages that already have a
text layer are used as-is. A fresh tesseract worker is created and terminated per
call, so the engine is stateless.

`createOcrEngine(options)` returns an `OcrEngine` (`{ ocrPages(pdf, pageNumbers) }`).
Because that interface is tiny, you can implement your own engine (a cloud OCR
API, a different WASM model) and pass it to `parseDocument({ ocr })` instead.

Options: `lang` (default `"eng"`), `scale` (render scale, default `3`),
`minConfidence` (0–100, default `40`), `standardFontDataUrl` (pdf.js standard
font directory, only needed to rasterize pages that draw standard-14 font text).

Notes:

- **Node** uses the optional `@napi-rs/canvas`; install it or pass a browser-style
  canvas. **Browser** uses the DOM canvas (configure the pdf.js worker in your app).
- The tesseract language model (~15 MB) is downloaded on first use and cached.

Dual-licensed: AGPL-3.0-or-later or a commercial license.
