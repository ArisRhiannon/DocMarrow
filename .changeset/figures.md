---
"docmarrow": minor
---

Extract embedded figures/images across all formats + pluggable `describeImage`
captioning hook — closes the RAG gap where charts/diagrams were silently dropped.

- New `figure` block (`{ alt, ref, mime?, bytes? }`), serialized to Markdown as
  `![alt](ref)` and woven into reading order; it feeds the chunker like any block.
- **PDF**: image XObjects located from the content stream with their on-page
  bbox and a stable `ref` (`p2-img1`); pixels are not decoded (canvas-free core).
- **DOCX / PPTX**: pictures resolved through relationships to the embedded media,
  carrying `mime` + `bytes` and authored alt text (`descr`).
- **HTML**: `<img>` becomes a figure; `data:` URIs are decoded to `bytes`.
- New `describeImage` hook on `parseDocument` (mirrors the `ocr` engine): captions
  figures with no alt text — e.g. via a vision LLM — so they become searchable.
  Authored alt text is never overwritten; describer errors are non-fatal.
- Shared OOXML helpers gained `deepAll`, `readBinaryEntries` and `mimeFromExt`.
