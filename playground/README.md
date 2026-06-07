# docmarrow playground

A tiny [Vite](https://vitejs.dev) app that parses PDFs and DOCX files **entirely
in the browser** — no server, no upload. It proves the "pure JS/WASM, runs
anywhere" claim: the same `parseDocument()` you use in Node runs client-side.

```bash
pnpm build                              # build docmarrow first
pnpm --filter @docmarrow/playground dev  # open the printed localhost URL
```

Drop a `.pdf`/`.docx`, or click the sample buttons, and switch between the
Markdown / JSON / Chunks tabs.

Notes:

- The pdf.js worker is configured in `src/main.ts`; `vite.config.ts` dedupes
  `pdfjs-dist` so the bundled backend and the worker share one copy.
- DOCX parsing is plain JS (no worker). PDF parsing uses the pdf.js WASM/worker.

Build a static bundle with `pnpm --filter @docmarrow/playground build`.
