# @docparse/docx

DOCX (OOXML) backend for [`docparse-ts`](https://github.com/ArisRhiannon/docparse-ts).
Internal workspace package — bundled into the published `docparse-ts`, not
released on its own.

Word `.docx` files carry explicit structure, so this backend maps it straight to
docparse's `Block[]` model — no geometric layout analysis needed:

- paragraph styles (`Heading1…`, `Title`, `Quote`, code/preformatted) → headings,
  quotes and code blocks; `w:outlineLvl` is used as a heading fallback
- `w:numPr` + `word/numbering.xml` → ordered/unordered lists, nested by `w:ilvl`
- `w:tbl` / `w:tr` / `w:tc` → tables
- `docProps/core.xml` → document title

Pure JS — [`fflate`](https://github.com/101arrowz/fflate) to read the zip
container and [`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser)
to parse the OOXML — so it runs in Node, the browser and edge runtimes.

```ts
import { analyzeDocx } from "@docparse/docx";

const { blocks, title, warnings } = analyzeDocx(bytes);
```
