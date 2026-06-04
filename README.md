# docparse

**Layout-aware document parsing for RAG. TypeScript-native. No Python, no servers.**

`docparse` turns a PDF into clean **Markdown**, a structured **JSON** content
tree, and **RAG-ready chunks** — reconstructing reading order, multi-column
flow, headings, lists and tables instead of dumping raw positioned text.

It is pure JS/WASM (via [`pdfjs-dist`](https://github.com/mozilla/pdf.js)), so it
runs in Node, the browser and edge runtimes without native binaries or a Python
sidecar.

> **Status: early (v0.1).** The core pipeline is implemented, typed and tested,
> and works on digital (text-based) PDFs. It is **not** a finished product yet —
> see [Status & limitations](#status--limitations) for exactly what works and
> what does not. No benchmark numbers are claimed here because none have been
> run yet; see [Benchmarks](#benchmarks).

## Why

PDFs store *positions*, not *structure*. Most JS parsers hand you a flat soup of
text runs, so tables collapse, multi-column pages interleave, and heading
hierarchy is lost — which produces broken chunks and a worse RAG pipeline. The
strong document parsers (Docling, Marker, MarkItDown, Unstructured) are all
Python. `docparse` aims to bring layout-aware parsing to the JS/TS ecosystem.

## Install

```bash
npm install docparse
# or: pnpm add docparse / yarn add docparse
```

## Quickstart

```ts
import { parseDocument } from "docparse";
import { readFile } from "node:fs/promises";

const doc = await parseDocument(new Uint8Array(await readFile("report.pdf")));
console.log(doc.markdown); // clean Markdown, ready for an LLM
```

## API

```ts
const doc = await parseDocument(bytes, {
  format: "pdf",            // autodetected from the %PDF header if omitted
  mode: "fast",             // "fast" = deterministic, rule-based (default)
  tables: true,             // detect tables (basic geometric)
  readingOrder: true,       // reconstruct multi-column reading order
  dropHeadersFooters: true, // remove repeated headers/footers and page numbers
});

doc.markdown   // string
doc.blocks     // structured blocks: { type, page, bbox, confidence, ... }[]
doc.json       // uniform content tree: { type, page, bbox, confidence, content }[]
doc.pages      // blocks grouped by 1-based page index

// Structure-aware chunking for RAG (never splits a table or paragraph mid-block)
const chunks = doc.chunks({ maxTokens: 512, overlap: 64 });
// -> { text, tokens, pages, path, bbox }[]
//    `path` is the heading breadcrumb; `tokens` is a heuristic estimate.
```

`bytes` accepts a `Uint8Array`, `ArrayBuffer`, or any `ArrayBufferView`.

### CLI

```bash
npx docparse report.pdf -o report.md --json report.json --chunks chunks.json
```

```
docparse <file.pdf> [options]
  -o, --out <file>       Write Markdown to <file> (default: stdout)
      --json <file>      Write the JSON content tree
      --chunks <file>    Write RAG chunks (JSON)
      --max-tokens <n>   Max tokens per chunk (default: 512)
      --overlap <n>      Token overlap between chunks (default: 64)
      --no-tables        Disable table detection
      --no-reading-order Disable multi-column reordering
      --keep-headers     Keep running headers/footers and page numbers
```

## How it works

The deterministic `fast` pipeline:

1. **Extraction** — `pdfjs-dist` yields positioned text runs per page, converted
   to a top-left coordinate convention (`@docparse/pdf`).
2. **Segmentation & reading order** — items are split into columns by detecting
   vertical whitespace gutters, with a heuristic that distinguishes genuine text
   columns from aligned grids (tables), and full-width titles/footers split the
   page into bands so they order correctly around columns.
3. **Header/footer removal** — margin lines that repeat across pages, and bare
   page numbers, are dropped.
4. **Table detection** — runs of vertically adjacent lines whose cells align
   into shared columns are reconstructed into rows (basic geometric approach).
5. **Structure detection** — headings (by font-size ratio / bold), ordered and
   unordered lists (with nesting by indentation), and paragraphs (wrapped lines
   merged using adaptive line-pitch, with soft-hyphen joining).
6. **Serialization** — to Markdown and to a uniform JSON content tree, plus a
   structure-aware chunker.

Every block carries a `page`, a `bbox`, and a heuristic `confidence` for
citations and traceability.

## Packages

| Package | Purpose | License |
| --- | --- | --- |
| `docparse` | Main entry — `parseDocument()` | AGPL-3.0-or-later |
| `@docparse/core` | Layout, structure, tables, serializers, chunker (pure) | AGPL-3.0-or-later |
| `@docparse/pdf` | `pdfjs-dist` extraction backend | AGPL-3.0-or-later |
| `@docparse/cli` | Command-line interface | AGPL-3.0-or-later |

The core is backend-agnostic: it analyses `PageInput[]` (positioned items), so
additional backends (DOCX/PPTX/XLSX) can feed the same pipeline later.

## Status & limitations

What works today, verified by the test suite and on real PDFs:

- Digital (text-based) PDFs → Markdown + JSON + chunks
- Multi-column reading order, with column-vs-table disambiguation
- Heading / list / paragraph detection; running header/footer removal
- Basic geometric table detection; structure-aware chunking with metadata
- ESM + CJS builds, strict TypeScript types, Node ≥ 20

Known limitations (deliberately honest):

- **Scanned PDFs are not supported** — there is no OCR. Text-based PDFs only.
- **Table detection is basic and geometric.** It recovers whitespace/alignment
  grids but does not do ruled-line vector analysis, merged/spanning cells, or
  rotated tables. A page that is *entirely* one table may be misread as columns.
- **`mode: "boost"`** (VLM/LLM refinement) is **not implemented** in the core;
  it throws and is reserved for an optional refiner module.
- **DOCX/PPTX/XLSX** are not implemented yet (planned).
- Token counts from chunking are a heuristic estimate, not a model tokenizer.
- Browser/edge usage is architecturally supported (pure JS/WASM) but has not yet
  been packaged with a demo/playground.

## Benchmarks

None yet. A reproducible benchmark against other JS/TS parsers is the intended
next step; this README will not quote quality numbers until that harness exists
and can be run by anyone.

## Development

```bash
pnpm install
pnpm build        # build all packages (tsup: ESM + CJS + d.ts)
pnpm test         # run the vitest suite
pnpm typecheck    # strict tsc --noEmit across packages
```

## License

Dual-licensed: **AGPL-3.0-or-later** (see [`LICENSE`](./LICENSE)) **or** a
commercial license (see [`COMMERCIAL-LICENSE.md`](./COMMERCIAL-LICENSE.md)).
If the AGPL's network-copyleft terms do not fit your use, the commercial license
is the intended alternative.
