---
"docmarrow": minor
---

docmarrow 1.0 — multi-format, richer structure, demos, benchmark.

Additions (backward-compatible; `parseDocument` keeps its shape and now also
returns `meta`):

- **DOCX support.** A pure-JS OOXML backend parses Word `.docx` (headings via
  styles, ordered/unordered nested lists via numbering, tables, code, quotes,
  title). Format is autodetected (`%PDF` vs the OOXML zip signature) or can be
  forced with `format: "docx"`.
- **`code` and `quote` blocks** are now detected: monospace runs become code
  blocks (PDF + DOCX); italic/inset text (PDF) and the Word `Quote` style (DOCX)
  become block quotes. These block types previously existed but were never
  emitted.
- **`doc.meta`** — `{ format, pageCount, hasText, title?, warnings[] }`.
  Pages with no extractable text (scanned/image-only) are surfaced as warnings
  instead of failing silently.
- **Pluggable tokenizer** — `chunks({ countTokens })` to plug in a real model
  tokenizer; the default remains the dependency-free word heuristic.
- **PDF font styling fixed** — bold/italic/monospace are now resolved from
  embedded fonts (previously unavailable during text extraction), which is what
  enables code/quote detection on real PDFs.
- **Robustness** — the caller's input buffer is no longer detached by pdf.js, so
  the same bytes can be parsed more than once.
- Runnable `examples/`, an in-browser `playground/` (verified in headless
  Chromium), a reproducible timing `bench/`, and CI on Node 20/22.
