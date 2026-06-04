# @docparse/core

> Internal workspace module — **not published to npm**. It is bundled into the
> [`docparse-ts`](https://www.npmjs.com/package/docparse-ts) package at build time.

The backend-agnostic core of [`docparse`](https://github.com/ArisRhiannon/docparse#readme):
layout analysis, reading-order/column detection, header/footer removal, table
detection, heading/list/paragraph structure detection, Markdown and JSON
serializers, and a structure-aware RAG chunker.

It operates on `PageInput[]` — positioned text items in a top-left coordinate
convention — so any extraction backend can feed it.

```ts
import { analyze, toMarkdown, chunkBlocks } from "@docparse/core";

const { blocks } = analyze(pages /* PageInput[] */);
const markdown = toMarkdown(blocks);
const chunks = chunkBlocks(blocks, { maxTokens: 512 });
```

Most users should use the [`docparse`](https://www.npmjs.com/package/docparse)
package instead, which pairs this with a PDF backend.

Dual-licensed: AGPL-3.0-or-later or a commercial license.
