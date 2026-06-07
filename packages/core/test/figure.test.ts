import { describe, expect, it } from "vitest";
import { chunkBlocks, toContentTree, toMarkdown, type Block } from "../src/index.js";

const fig = (over: Partial<Extract<Block, { type: "figure" }>> = {}): Block => ({
  type: "figure",
  alt: "A bar chart of quarterly revenue",
  ref: "word/media/image1.png",
  mime: "image/png",
  page: 1,
  bbox: { x: 0, y: 0, width: 0, height: 0 },
  confidence: 0.9,
  ...over,
});

describe("figure blocks", () => {
  it("renders markdown as an image with alt text + ref", () => {
    expect(toMarkdown([fig()])).toContain(
      "![A bar chart of quarterly revenue](word/media/image1.png)",
    );
  });

  it("renders an undescribed figure as ![](ref)", () => {
    expect(toMarkdown([fig({ alt: "" })]).trim()).toBe("![](word/media/image1.png)");
  });

  it("escapes ] and newlines in alt so markdown stays valid", () => {
    const md = toMarkdown([fig({ alt: "a] b\nc" })]).trim();
    expect(md).toBe("![a\\] b c](word/media/image1.png)");
  });

  it("json node carries ref/mime and uses alt as content", () => {
    const [node] = toContentTree([fig()]);
    expect(node).toMatchObject({
      type: "figure",
      ref: "word/media/image1.png",
      mime: "image/png",
      content: "A bar chart of quarterly revenue",
    });
  });

  it("makes the figure's alt text searchable inside chunks", () => {
    const chunks = chunkBlocks([
      { type: "heading", level: 1, text: "Report", page: 1, bbox: fig().bbox, confidence: 1 },
      fig({ alt: "revenue grew 12% YoY" }),
    ]);
    expect(chunks[0]!.text).toContain("revenue grew 12% YoY");
  });
});
