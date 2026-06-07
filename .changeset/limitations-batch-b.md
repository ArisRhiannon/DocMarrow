---
"docmarrow": minor
---

Resolve several documented limitations (and keep the deliberate ones honest):

- **Nested mixed lists** now render correctly: list items carry a per-item
  `ordered` flag, so an `<ol>` inside a `<ul>` (or a decimal level inside a
  bulleted one in DOCX) no longer inherits the wrong style. Applies to HTML,
  DOCX and PPTX (PPTX detects `a:buAutoNum`).
- **XLSX date/percent formatting**: common date/time and percent number formats
  are applied (`45292` → `2024-01-01`, `0.25` → `25%`) instead of emitting the
  raw serial; other formats keep the stored value (conservative by design).
- **XLSX images** are extracted (`xl/drawings` → `xl/media`) as figures per sheet.
- **Inline `<svg>`** content is captured as a figure (markup as bytes); decorative
  icon svgs are skipped by heuristic.
- **PPTX speaker notes** via the opt-in `speakerNotes` option (off by default):
  `ppt/notesSlides/*` are appended per slide as a quote block.

Deliberate, unchanged by design: OCR (opt-in `@docmarrow/ocr`), image captioning
(opt-in `describeImage`), and token counting (pluggable `countTokens`) stay out
of the core to keep it pure JS with no native/heavy dependencies.
