import { describe, expect, it } from "vitest";
import { toMarkdown, type Block } from "@docmarrow/core";
import { analyzeHtml } from "../src/index.js";

const HTML = `<!doctype html><html><head><title>Doc Title</title></head><body>
  <h1>Main Heading</h1>
  <p>An <strong>intro</strong> paragraph with inline markup.</p>
  <h2>Section</h2>
  <ul>
    <li>First item</li>
    <li>Second item
      <ol><li>Nested a</li><li>Nested b</li></ol>
    </li>
  </ul>
  <table>
    <thead><tr><th>Name</th><th>Age</th></tr></thead>
    <tbody><tr><td>Alice</td><td>30</td></tr></tbody>
  </table>
  <pre><code>const x = 1;
return x;</code></pre>
  <blockquote>To be or not to be.</blockquote>
</body></html>`;

describe("analyzeHtml", () => {
  const { blocks, title, warnings } = analyzeHtml(HTML);
  const find = <T extends Block["type"]>(t: T): Extract<Block, { type: T }>[] =>
    blocks.filter((b) => b.type === t) as Extract<Block, { type: T }>[];

  it("reads <title> and reports no warnings", () => {
    expect(title).toBe("Doc Title");
    expect(warnings).toEqual([]);
  });

  it("maps h1/h2 to heading levels", () => {
    const hs = find("heading");
    expect(hs.find((h) => h.text === "Main Heading")!.level).toBe(1);
    expect(hs.find((h) => h.text === "Section")!.level).toBe(2);
  });

  it("flattens inline markup into a paragraph", () => {
    const p = find("paragraph")[0]!;
    expect(p.text).toBe("An intro paragraph with inline markup.");
  });

  it("builds a nested list (ul with an inner ol) with per-item ordered flags", () => {
    const list = find("list")[0]!;
    expect(list.items.map((i) => `${i.level}:${i.ordered ? "o" : "u"}:${i.text}`)).toEqual([
      "0:u:First item",
      "0:u:Second item",
      "1:o:Nested a",
      "1:o:Nested b",
    ]);
  });

  it("reconstructs a table from thead/tbody", () => {
    expect(find("table")[0]!.rows).toEqual([
      ["Name", "Age"],
      ["Alice", "30"],
    ]);
  });

  it("captures pre/code as a code block preserving newlines", () => {
    const code = find("code")[0]!;
    expect(code.text.split("\n")).toHaveLength(2);
    expect(code.text).toContain("const x = 1;");
  });

  it("captures a blockquote", () => {
    expect(find("quote")[0]!.text).toBe("To be or not to be.");
  });

  it("serializes to coherent Markdown", () => {
    const md = toMarkdown(blocks);
    expect(md).toContain("# Main Heading");
    expect(md).toContain("## Section");
    expect(md).toContain("- First item");
    // The nested <ol> inside the outer <ul> now renders as an ordered sublist
    // (per-item ordered flag), not inheriting the outer bullet style.
    expect(md).toContain("  1. Nested a");
    expect(md).toContain("  2. Nested b");
    expect(md).toContain("| Name | Age |");
    expect(md).toContain("> To be or not to be.");
  });

  it("accepts UTF-8 bytes and falls back to the first h1 as title", () => {
    const res = analyzeHtml(new TextEncoder().encode("<h1>Only Heading</h1><p>body</p>"));
    expect(res.title).toBe("Only Heading");
    expect(res.blocks[0]).toMatchObject({ type: "heading", level: 1 });
  });

  it("warns on empty content", () => {
    const res = analyzeHtml("<html><body></body></html>");
    expect(res.blocks).toEqual([]);
    expect(res.warnings.some((w) => /no extractable content/i.test(w))).toBe(true);
  });
});
