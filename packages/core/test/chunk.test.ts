import { describe, expect, it } from "vitest";
import { chunkBlocks, estimateTokens, type Block } from "../src/index.js";

const bbox = { x: 0, y: 0, width: 100, height: 10 };

function para(text: string, page = 1): Block {
  return { type: "paragraph", text, page, bbox, confidence: 0.8 };
}

describe("chunkBlocks", () => {
  it("keeps chunks under maxTokens and never splits a block", () => {
    const longTable: Block = {
      type: "table",
      rows: Array.from({ length: 20 }, (_, i) => [`r${i}c0`, `r${i}c1`, `r${i}c2`]),
      page: 1,
      bbox,
      confidence: 0.6,
    };
    const chunks = chunkBlocks([para("alpha beta gamma"), longTable, para("delta epsilon")], {
      maxTokens: 20,
      overlap: 0,
    });
    // The oversized table must appear whole inside exactly one chunk.
    const tableChunks = chunks.filter((c) => c.text.includes("r0c0") && c.text.includes("r19c2"));
    expect(tableChunks).toHaveLength(1);
  });

  it("records the heading breadcrumb path", () => {
    const blocks: Block[] = [
      { type: "heading", level: 1, text: "Intro", page: 1, bbox, confidence: 0.7 },
      { type: "heading", level: 2, text: "Goals", page: 1, bbox, confidence: 0.7 },
      para("some goal text here"),
    ];
    const chunks = chunkBlocks(blocks, { maxTokens: 1000 });
    expect(chunks[0]!.path).toEqual(["Intro", "Goals"]);
  });

  it("tracks the pages a chunk spans", () => {
    const chunks = chunkBlocks([para("page one text", 1), para("page two text", 2)], {
      maxTokens: 1000,
    });
    expect(chunks[0]!.pages).toEqual([1, 2]);
  });

  it("carries overlap between consecutive chunks", () => {
    const blocks = Array.from({ length: 6 }, (_, i) => para(`block number ${i} content`));
    const chunks = chunkBlocks(blocks, { maxTokens: 12, overlap: 6 });
    expect(chunks.length).toBeGreaterThan(1);
    // The last block of chunk[0] should reappear at the start of chunk[1].
    const tail = chunks[0]!.text.split("\n\n").at(-1)!;
    expect(chunks[1]!.text.startsWith(tail)).toBe(true);
  });
});

describe("estimateTokens", () => {
  it("returns 0 for empty text and scales with word count", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("one two three")).toBeGreaterThan(0);
  });
});
