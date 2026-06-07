import { describe, expect, it } from "vitest";
import { analyze } from "../src/index.js";
import { item, page } from "./_util.js";

describe("analyze warnings", () => {
  it("warns about pages with no extractable text (possibly scanned)", () => {
    const withText = page([item("Some real text on this page", 50, 100, { width: 300 })]);
    const empty = page([]); // e.g. an image-only / scanned page
    const { warnings } = analyze([withText, empty]);
    expect(warnings.some((w) => /page 2/i.test(w) && /no extractable text/i.test(w))).toBe(true);
  });

  it("reports no warnings when every page has text", () => {
    const a = page([item("Page one body text here", 50, 100, { width: 300 })]);
    const b = page([item("Page two body text here", 50, 100, { width: 300 })]);
    expect(analyze([a, b]).warnings).toEqual([]);
  });
});
