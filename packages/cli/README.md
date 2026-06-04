# @docparse/cli

Command-line interface for [`docparse`](https://github.com/ArisRhiannon/docparse#readme).

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
  -h, --help             Show help
  -v, --version          Show version
```

Dual-licensed: AGPL-3.0-or-later or a commercial license.
