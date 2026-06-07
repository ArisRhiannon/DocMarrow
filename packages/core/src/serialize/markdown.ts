import type { Block } from "../types.js";

const escapeCell = (s: string): string => s.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();

function renderTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const cols = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]): string[] =>
    Array.from({ length: cols }, (_, c) => escapeCell(r[c] ?? ""));
  const header = pad(rows[0]!);
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.slice(1).map((r) => `| ${pad(r).join(" | ")} |`),
  ];
  return lines.join("\n");
}

function renderBlock(block: Block): string {
  switch (block.type) {
    case "heading":
      return `${"#".repeat(block.level)} ${block.text}`;
    case "paragraph":
      return block.text;
    case "code":
      return "```\n" + block.text + "\n```";
    case "quote":
      return block.text
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
    case "table":
      return renderTable(block.rows);
    case "figure": {
      const alt = block.alt.replace(/\]/g, "\\]").replace(/\s+/g, " ").trim();
      return `![${alt}](${block.ref})`;
    }
    case "list": {
      const counters: number[] = [];
      return block.items
        .map((item) => {
          const indent = "  ".repeat(item.level);
          if (block.ordered) {
            counters.length = item.level + 1;
            counters[item.level] = (counters[item.level] ?? 0) + 1;
            return `${indent}${counters[item.level]}. ${item.text}`;
          }
          return `${indent}- ${item.text}`;
        })
        .join("\n");
    }
  }
}

/** Serialize structured blocks into clean Markdown. */
export function toMarkdown(blocks: Block[]): string {
  return blocks.map(renderBlock).join("\n\n").trim() + "\n";
}
