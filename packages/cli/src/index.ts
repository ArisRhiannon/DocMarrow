import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { parseDocument } from "docparse";

const HELP = `docparse — layout-aware PDF → Markdown/JSON/chunks

Usage:
  docparse <file.pdf> [options]

Options:
  -o, --out <file>       Write Markdown to <file> (default: stdout)
      --json <file>      Write structured JSON content tree to <file>
      --chunks <file>    Write RAG chunks (JSON) to <file>
      --max-tokens <n>   Max tokens per chunk (default: 512)
      --overlap <n>      Token overlap between chunks (default: 64)
      --no-tables        Disable table detection
      --no-reading-order Disable multi-column reading-order reconstruction
      --keep-headers     Keep running headers/footers and page numbers
  -h, --help             Show this help
  -v, --version          Show version

Example:
  docparse report.pdf -o report.md --json report.json
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      json: { type: "string" },
      chunks: { type: "string" },
      "max-tokens": { type: "string" },
      overlap: { type: "string" },
      "no-tables": { type: "boolean" },
      "no-reading-order": { type: "boolean" },
      "keep-headers": { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  if (values.version) {
    process.stdout.write("0.1.0\n");
    return;
  }
  if (values.help || positionals.length === 0) {
    process.stdout.write(HELP);
    if (positionals.length === 0 && !values.help) process.exitCode = 1;
    return;
  }

  const inputPath = positionals[0]!;
  const bytes = await readFile(inputPath);

  const doc = await parseDocument(new Uint8Array(bytes), {
    tables: !values["no-tables"],
    readingOrder: !values["no-reading-order"],
    dropHeadersFooters: !values["keep-headers"],
  });

  if (values.json) {
    await writeFile(values.json, JSON.stringify(doc.json, null, 2));
    process.stderr.write(`Wrote JSON → ${values.json}\n`);
  }

  if (values.chunks) {
    const opts = {
      ...(values["max-tokens"] ? { maxTokens: Number(values["max-tokens"]) } : {}),
      ...(values.overlap ? { overlap: Number(values.overlap) } : {}),
    };
    await writeFile(values.chunks, JSON.stringify(doc.chunks(opts), null, 2));
    process.stderr.write(`Wrote chunks → ${values.chunks}\n`);
  }

  if (values.out) {
    await writeFile(values.out, doc.markdown);
    process.stderr.write(`Wrote Markdown → ${values.out}\n`);
  } else if (!values.json && !values.chunks) {
    process.stdout.write(doc.markdown);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`docparse: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
