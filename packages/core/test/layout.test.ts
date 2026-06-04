import { describe, expect, it } from "vitest";
import { groupLines } from "../src/index.js";
import { item } from "./_util.js";

describe("groupLines", () => {
  it("groups items on the same baseline into one line, ordered left to right", () => {
    const lines = groupLines([
      item("world", 120, 100),
      item("hello", 50, 101),
      item("second", 50, 140),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.text).toBe("hello world");
    expect(lines[1]!.text).toBe("second");
  });

  it("ignores whitespace-only items", () => {
    const lines = groupLines([item("   ", 50, 100), item("real", 60, 100)]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe("real");
  });

  it("marks a line bold when the majority of its width is bold", () => {
    const lines = groupLines([
      item("Bold Title Here", 50, 100, { bold: true, width: 200 }),
    ]);
    expect(lines[0]!.bold).toBe(true);
  });
});
