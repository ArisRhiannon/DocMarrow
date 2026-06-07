import { describe, expect, it } from "vitest";
import { detectRuledTables, groupLines, type Rule } from "../src/index.js";
import { item } from "./_util.js";

// A 2x2 ruled grid: borders at y = 100/130/160 and x = 50/150/250.
const gridRules = (): Rule[] => [
  { x0: 50, y0: 100, x1: 250, y1: 100 },
  { x0: 50, y0: 130, x1: 250, y1: 130 },
  { x0: 50, y0: 160, x1: 250, y1: 160 },
  { x0: 50, y0: 100, x1: 50, y1: 160 },
  { x0: 150, y0: 100, x1: 150, y1: 160 },
  { x0: 250, y0: 100, x1: 250, y1: 160 },
];

describe("detectRuledTables", () => {
  it("reconstructs a 2x2 grid, separating cells that share a baseline", () => {
    // "Name"/"Age" share one baseline; "Alice"/"30" share the next.
    const lines = groupLines([
      item("Name", 70, 109, { width: 40 }),
      item("Age", 170, 109, { width: 30 }),
      item("Alice", 70, 139, { width: 40 }),
      item("30", 170, 139, { width: 20 }),
    ]);
    const { tables, consumed } = detectRuledTables(lines, gridRules());
    expect(tables).toHaveLength(1);
    expect(tables[0]!.rows).toEqual([
      ["Name", "Age"],
      ["Alice", "30"],
    ]);
    expect(consumed.size).toBe(2);
  });

  it("ignores a lone underline (fewer than a 2x2 grid of rules)", () => {
    const lines = groupLines([item("Heading", 50, 100, { width: 80 })]);
    const underline: Rule[] = [{ x0: 50, y0: 118, x1: 200, y1: 118 }];
    expect(detectRuledTables(lines, underline).tables).toHaveLength(0);
  });

  it("does not emit a table for an empty (text-free) grid", () => {
    expect(detectRuledTables([], gridRules()).tables).toHaveLength(0);
  });
});
