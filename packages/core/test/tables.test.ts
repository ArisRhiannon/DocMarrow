import { describe, expect, it } from "vitest";
import { detectTables, groupLines } from "../src/index.js";
import { item } from "./_util.js";

describe("detectTables", () => {
  it("recovers a whitespace-separated grid into rows and columns", () => {
    const lines = groupLines([
      item("Name", 50, 100, { width: 40 }),
      item("Age", 200, 100, { width: 30 }),
      item("Alice", 50, 120, { width: 40 }),
      item("30", 200, 120, { width: 20 }),
      item("Bob", 50, 140, { width: 30 }),
      item("25", 200, 140, { width: 20 }),
    ]);
    const { tables, consumed } = detectTables(lines);
    expect(tables).toHaveLength(1);
    expect(tables[0]!.rows).toEqual([
      ["Name", "Age"],
      ["Alice", "30"],
      ["Bob", "25"],
    ]);
    // Three baselines → three lines consumed (each line splits into two cells).
    expect(consumed.size).toBe(3);
  });

  it("does not treat ordinary prose lines as a table", () => {
    const lines = groupLines([
      item("This is a normal sentence of prose.", 50, 100, { width: 300 }),
      item("Followed by another normal sentence.", 50, 120, { width: 300 }),
    ]);
    expect(detectTables(lines).tables).toHaveLength(0);
  });
});
