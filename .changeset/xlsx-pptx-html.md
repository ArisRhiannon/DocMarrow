---
"docmarrow": minor
---

Add XLSX, PPTX and HTML backends — DocMarrow now parses PDF, DOCX, XLSX, PPTX and
HTML through one `parseDocument()` with autodetection.

- **XLSX** (`@docmarrow/xlsx`): each non-empty sheet becomes a heading (sheet
  name) + a table of its used cell range, resolving shared strings, numbers,
  inline strings and booleans.
- **PPTX** (`@docmarrow/pptx`): each slide becomes a heading (its title or
  "Slide N") with bulleted body text (nested lists) and slide tables, in
  presentation order.
- **HTML** (`@docmarrow/html`): `h1`–`h6`, `p`, `ul`/`ol`, `table`, `pre` and
  `blockquote` map to the matching blocks; loose inline text becomes paragraphs.
- Shared OOXML helpers extracted to `@docmarrow/ooxml` (used by docx/xlsx/pptx).
- `parseDocument` autodetects the format: `%PDF`, the OOXML subtype (by the
  marker part inside the zip), or HTML; `format` can also be forced explicitly.
