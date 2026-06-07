import { describe, expect, it } from "vitest";
import { groupLines, structureLines, type Block } from "../src/index.js";
import { item } from "./_util.js";

function blocks(items: Parameters<typeof groupLines>[0], bodyFont = 12): Block[] {
  const lines = groupLines(items);
  const left = lines.length ? Math.min(...lines.map((l) => l.x)) : 0;
  return structureLines(lines, 1, bodyFont, left);
}

describe("structureLines headings", () => {
  it("assigns heading levels from font-size ratio", () => {
    const out = blocks([
      item("Big Title", 50, 40, { fontSize: 24 }),
      item("Section", 50, 100, { fontSize: 18 }),
      item("Subsection", 50, 160, { fontSize: 15 }),
    ]);
    expect(out.map((b) => b.type === "heading" && b.level)).toEqual([1, 2, 3]);
  });

  it("treats a short bold same-size line as a level-4 heading", () => {
    const out = blocks([item("Bold Lead", 50, 40, { bold: true, width: 80 })]);
    expect(out[0]).toMatchObject({ type: "heading", level: 4 });
  });
});

describe("structureLines lists", () => {
  it("detects an unordered list", () => {
    const out = blocks([
      item("- apples", 50, 100),
      item("- bananas", 50, 120),
    ]);
    expect(out[0]).toMatchObject({ type: "list", ordered: false });
    expect((out[0] as Extract<Block, { type: "list" }>).items.map((i) => i.text)).toEqual([
      "apples",
      "bananas",
    ]);
  });

  it("detects an ordered list and nesting via indentation", () => {
    const out = blocks([
      item("1. first", 50, 100),
      item("2. second", 50, 120),
      item("a. nested", 68, 140),
    ]);
    const list = out[0] as Extract<Block, { type: "list" }>;
    expect(list).toMatchObject({ type: "list", ordered: true });
    expect(list.items[2]!.level).toBe(1);
  });
});

describe("structureLines paragraphs", () => {
  it("merges wrapped lines and breaks on a larger vertical gap", () => {
    const out = blocks([
      item("first wrapped line of a paragraph", 50, 0, { width: 300 }),
      item("second wrapped line same paragraph", 50, 14, { width: 300 }),
      item("third wrapped line same paragraph", 50, 28, { width: 300 }),
      item("a separate paragraph after a gap", 50, 80, { width: 300 }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ type: "paragraph" });
    expect((out[0] as Extract<Block, { type: "paragraph" }>).text).toContain("third wrapped");
    expect((out[1] as Extract<Block, { type: "paragraph" }>).text).toBe(
      "a separate paragraph after a gap",
    );
  });

  it("de-hyphenates soft line breaks", () => {
    const out = blocks([
      item("inter-", 50, 0, { width: 40 }),
      item("national cooperation", 50, 14, { width: 200 }),
    ]);
    expect((out[0] as Extract<Block, { type: "paragraph" }>).text).toBe(
      "international cooperation",
    );
  });
});

describe("structureLines code blocks", () => {
  it("groups consecutive monospace lines into a code block, preserving line breaks", () => {
    const out = blocks([
      item("function add(a, b) {", 50, 0, { mono: true, width: 160 }),
      item("return a + b;", 66, 16, { mono: true, width: 110 }),
      item("}", 50, 32, { mono: true, width: 10 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe("code");
    const code = out[0] as Extract<Block, { type: "code" }>;
    // Lines are NOT merged into a paragraph; newlines are preserved.
    expect(code.text.split("\n")).toHaveLength(3);
    expect(code.text).toContain("function add(a, b) {");
    expect(code.text).toContain("return a + b;");
  });

  it("does not treat ordinary prose as code", () => {
    const out = blocks([
      item("This is a normal sentence of prose text.", 50, 0, { width: 300 }),
    ]);
    expect(out[0]!.type).toBe("paragraph");
  });
});

describe("structureLines block quotes", () => {
  it("detects an italic, indented run as a quote", () => {
    const out = blocks([
      item("Normal body paragraph at the margin here.", 50, 0, { width: 320 }),
      item("The only thing we have to fear is fear itself,", 90, 40, {
        italic: true,
        width: 280,
      }),
      item("and there is nothing to add to that.", 90, 56, { italic: true, width: 240 }),
    ]);
    const quote = out.find((b) => b.type === "quote") as Extract<Block, { type: "quote" }> | undefined;
    expect(quote).toBeDefined();
    expect(quote!.text).toContain("fear itself");
    expect(quote!.text).toContain("nothing to add");
  });

  it("does not treat an upright indented line as a quote", () => {
    const out = blocks([
      item("A normal indented first line of a paragraph,", 90, 0, { width: 280 }),
    ]);
    expect(out.some((b) => b.type === "quote")).toBe(false);
  });
});
