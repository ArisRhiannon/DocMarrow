---
"docparse-ts": minor
---

Ruled (vector-line) PDF tables and optional OCR.

- **Ruled table detection.** PDF tables are now reconstructed from the page's
  actual border lines (parsed from the content stream operator list, with CTM
  tracking), grouped into grids via union-find. Text is assigned per item, so
  multi-word cells like "Item Name" stay intact instead of being split at their
  spaces. Borderless tables still fall back to the geometric (whitespace)
  detector, and both can coexist on a page.
- **Optional OCR** via the new opt-in `@docparse/ocr` package (tesseract.js).
  `parseDocument(bytes, { ocr })` rasterizes scanned/image-only pages and feeds
  the recognized, positioned words into the normal pipeline. `OcrEngine` is a
  one-method interface, so any OCR backend can be plugged in. OCR is **not**
  bundled into `docparse-ts`, keeping the core pure JS with no native deps.
