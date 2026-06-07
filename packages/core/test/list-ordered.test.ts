import { describe, expect, it } from "vitest";
import { toMarkdown, type Block, type ListItemNode } from "../src/index.js";

const bbox = { x: 0, y: 0, width: 0, height: 0 };
const list = (items: ListItemNode[], ordered = false): Block => ({
  type: "list",
  ordered,
  items,
  page: 1,
  bbox,
  confidence: 1,
});

describe("mixed ordered/unordered nested lists (per-item ordered flag)", () => {
  it("renders an ordered sublist inside an unordered list", () => {
    const md = toMarkdown([
      list(
        [
          { text: "fruit", level: 0, ordered: false },
          { text: "step one", level: 1, ordered: true },
          { text: "step two", level: 1, ordered: true },
          { text: "veg", level: 0, ordered: false },
        ],
        false,
      ),
    ]);
    expect(md.trim()).toBe(["- fruit", "  1. step one", "  2. step two", "- veg"].join("\n"));
  });

  it("renders an unordered sublist inside an ordered list", () => {
    const md = toMarkdown([
      list(
        [
          { text: "first", level: 0, ordered: true },
          { text: "note a", level: 1, ordered: false },
          { text: "second", level: 0, ordered: true },
        ],
        true,
      ),
    ]);
    expect(md.trim()).toBe(["1. first", "  - note a", "2. second"].join("\n"));
  });

  it("falls back to the block's ordered flag when an item has none (back-compat)", () => {
    const md = toMarkdown([list([{ text: "a", level: 0 }, { text: "b", level: 0 }], true)]);
    expect(md.trim()).toBe(["1. a", "2. b"].join("\n"));
  });

  it("resets deeper counters when a higher level advances", () => {
    const md = toMarkdown([
      list(
        [
          { text: "one", level: 0, ordered: true },
          { text: "a", level: 1, ordered: true },
          { text: "b", level: 1, ordered: true },
          { text: "two", level: 0, ordered: true },
          { text: "c", level: 1, ordered: true },
        ],
        true,
      ),
    ]);
    expect(md.trim()).toBe(["1. one", "  1. a", "  2. b", "2. two", "  1. c"].join("\n"));
  });
});
