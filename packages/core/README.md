# @docmarrow/core

> Internal workspace module — **not published to npm**. It is bundled into the
> [`docmarrow`](https://www.npmjs.com/package/docmarrow) package at build time.

The backend-agnostic core of [`docmarrow`](https://github.com/ArisRhiannon/DocMarrow#readme):
layout analysis, reading-order/column detection, header/footer removal, table
detection, heading/list/paragraph/code/quote structure detection, Markdown and
JSON serializers, and a structure-aware RAG chunker.

It operates on `PageInput[]` — positioned text items in a top-left coordinate
convention — so any extraction backend can feed it.

```ts
import { analyze, toMarkdown, chunkBlocks } from "@docmarrow/core";

const { blocks } = analyze(pages /* PageInput[] */);
const markdown = toMarkdown(blocks);
const chunks = chunkBlocks(blocks, { maxTokens: 512 });
```

Most users should use the [`docmarrow`](https://www.npmjs.com/package/docmarrow)
package instead, which pairs this with the PDF and DOCX backends.

Dual-licensed: AGPL-3.0-or-later or a commercial license.
