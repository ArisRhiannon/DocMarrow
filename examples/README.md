# docparse-ts examples

Runnable Node examples. Build the workspace first, then run any example:

```bash
pnpm build                       # build docparse-ts and its workspace deps
pnpm --filter @docparse/examples pdf      # parse a sample PDF
pnpm --filter @docparse/examples docx     # parse a sample DOCX
pnpm --filter @docparse/examples chunks   # RAG chunking + custom tokenizer
```

Each script generates its own sample document so no input files are required.
To parse your own file, replace the `makeSample*()` call with
`new Uint8Array(await readFile("your-file.pdf"))`.

| File | Shows |
| --- | --- |
| `parse-pdf.mjs` | PDF → Markdown, JSON content tree, metadata |
| `parse-docx.mjs` | DOCX → Markdown (format autodetected) |
| `chunk-and-tokenize.mjs` | structure-aware chunking and a custom `countTokens` |
