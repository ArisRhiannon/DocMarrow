import { describe, expect, it } from "vitest";
import { analyze, toContentTree, toMarkdown } from "../src/index.js";
import { item, page } from "./_util.js";

describe("analyze pipeline", () => {
  it("orders a full-width title above two columns and serializes to Markdown", () => {
    const input = page([
      // Full-width title.
      item("The Report", 50, 40, { fontSize: 24, width: 500 }),
      // Left column paragraph (wraps over three lines).
      item("Left column begins here with", 50, 120, { width: 200 }),
      item("a second wrapped line and then", 50, 138, { width: 200 }),
      item("a third wrapped line of text.", 50, 156, { width: 200 }),
      // Right column paragraph (baselines offset from the left column).
      item("Right column begins here with", 320, 127, { width: 200 }),
      item("its own second wrapped line and", 320, 145, { width: 200 }),
      item("a third wrapped line of text.", 320, 163, { width: 200 }),
    ]);

    const { blocks } = analyze([input]);
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "paragraph"]);

    const md = toMarkdown(blocks);
    expect(md).toBe(
      [
        "# The Report",
        "",
        "Left column begins here with a second wrapped line and then a third wrapped line of text.",
        "",
        "Right column begins here with its own second wrapped line and a third wrapped line of text.",
        "",
      ].join("\n"),
    );
  });

  it("produces a uniform JSON content tree with page and bbox metadata", () => {
    const input = page([
      item("Heading", 50, 40, { fontSize: 24, width: 100 }),
      item("First body line establishing the body font size.", 50, 100, { width: 300 }),
      item("Second body line at the same size as the first.", 50, 118, { width: 300 }),
      item("Third body line so the median font size is body.", 50, 136, { width: 300 }),
    ]);
    const tree = toContentTree(analyze([input]).blocks);
    expect(tree[0]).toMatchObject({ type: "heading", page: 1, level: 1, content: "Heading" });
    expect(tree[0]!.bbox).toMatchObject({ x: 50 });
  });
});
