import { describe, expect, it } from "vitest";
import { detectColumns, dropRunningHeadFoot, groupLines, segmentPage } from "../src/index.js";
import { item } from "./_util.js";

// Two-column prose: columns wrap independently, so baselines do NOT align.
const twoColumnItems = () => [
  item("left one", 50, 100, { width: 200 }),
  item("left two", 50, 118, { width: 200 }),
  item("left three", 50, 136, { width: 200 }),
  item("right one", 320, 107, { width: 200 }),
  item("right two", 320, 125, { width: 200 }),
  item("right three", 320, 143, { width: 200 }),
];

describe("detectColumns", () => {
  it("detects two columns separated by a central gutter", () => {
    const cols = detectColumns(twoColumnItems(), 600);
    expect(cols).toHaveLength(2);
    expect(cols[0]!.x1).toBeLessThan(cols[1]!.x0);
  });

  it("returns a single column for full-width prose", () => {
    const items = [
      item("a full width line of prose text here", 50, 100, { width: 500 }),
      item("another full width line of prose text", 50, 120, { width: 500 }),
      item("and a third full width prose line again", 50, 140, { width: 500 }),
      item("plus a fourth to satisfy the minimum", 50, 160, { width: 500 }),
    ];
    expect(detectColumns(items, 600)).toHaveLength(1);
  });
});

describe("segmentPage", () => {
  it("reads the entire left column before the right column", () => {
    const ordered = segmentPage(twoColumnItems(), 600).map((l) => l.text);
    expect(ordered).toEqual([
      "left one",
      "left two",
      "left three",
      "right one",
      "right two",
      "right three",
    ]);
  });

  it("treats an aligned grid as a single column (not prose columns)", () => {
    // Same gutter as two columns, but every baseline crosses it → a table.
    const grid = [
      item("Name", 50, 100, { width: 40 }),
      item("Age", 320, 100, { width: 30 }),
      item("Alice", 50, 118, { width: 40 }),
      item("30", 320, 118, { width: 20 }),
      item("Bob", 50, 136, { width: 30 }),
      item("25", 320, 136, { width: 20 }),
    ];
    const ordered = segmentPage(grid, 600);
    // Each row stays merged on one line rather than being split into columns.
    expect(ordered.map((l) => l.text)).toEqual(["Name Age", "Alice 30", "Bob 25"]);
  });

  it("orders a full-width title above the columns", () => {
    const items = [item("The Title Spanning Full Width", 50, 40, { width: 500 }), ...twoColumnItems()];
    const ordered = segmentPage(items, 600).map((l) => l.text);
    expect(ordered[0]).toBe("The Title Spanning Full Width");
    expect(ordered.slice(1, 4)).toEqual(["left one", "left two", "left three"]);
  });
});

describe("dropRunningHeadFoot", () => {
  it("removes headers repeated across at least half the pages and bare page numbers", () => {
    const mk = (n: number) => ({
      height: 800,
      lines: groupLines([
        item("My Report Title", 50, 20, { width: 200 }),
        item(`body text on page ${n}`, 50, 400, { width: 200 }),
        item(String(n), 290, 770),
      ]),
    });
    const filtered = dropRunningHeadFoot([mk(1), mk(2), mk(3)]);
    for (const lines of filtered) {
      const texts = lines.map((l) => l.text);
      expect(texts.some((t) => t.includes("My Report Title"))).toBe(false);
      expect(texts.some((t) => /^\d+$/.test(t))).toBe(false);
      expect(texts.some((t) => t.startsWith("body text"))).toBe(true);
    }
  });
});
