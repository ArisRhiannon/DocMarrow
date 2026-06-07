import { describe, expect, it } from "vitest";
import { parseDocument, type Block } from "../src/index.js";
import {
  codePdf,
  emptyPdf,
  headerFooterPdf,
  mixedPdf,
  multiColumnPdf,
  nestedListPdf,
  quotePdf,
  ruledTablePdf,
  tablePdf,
} from "./fixtures.js";

const typeOf = (b: Block): Block["type"] => b.type;

describe("varied PDF parsing", () => {
  it("reads a two-column page in column order under a full-width title", async () => {
    const doc = await parseDocument(await multiColumnPdf());
    expect(doc.blocks[0]).toMatchObject({ type: "heading" });
    const text = doc.blocks
      .filter((b): b is Extract<Block, { type: "paragraph" }> => b.type === "paragraph")
      .map((b) => b.text)
      .join(" ");
    // The entire left column must be read before the right column.
    expect(text.indexOf("Left column line one")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("Left column line three")).toBeLessThan(text.indexOf("Right column line one"));
  });

  it("recovers a dense aligned grid as a table", async () => {
    const doc = await parseDocument(await tablePdf());
    const table = doc.blocks.find((b) => b.type === "table") as
      | Extract<Block, { type: "table" }>
      | undefined;
    expect(table).toBeDefined();
    expect(table!.rows[0]).toEqual(["Product", "Region", "Units"]);
    expect(table!.rows).toHaveLength(4);
    // Markdown table renders with a header separator row.
    expect(doc.markdown).toContain("| --- | --- | --- |");
  });

  it("detects nested ordered list levels by indentation", async () => {
    const doc = await parseDocument(await nestedListPdf());
    const list = doc.blocks.find((b) => b.type === "list") as
      | Extract<Block, { type: "list" }>
      | undefined;
    expect(list).toBeDefined();
    expect(list!.ordered).toBe(true);
    const nested = list!.items.filter((i) => i.level >= 1);
    expect(nested.length).toBeGreaterThanOrEqual(2);
  });

  it("removes running headers and page numbers across pages but keeps body", async () => {
    const doc = await parseDocument(await headerFooterPdf());
    expect(doc.meta.pageCount).toBe(3);
    expect(doc.markdown).not.toContain("ACME Confidential Report");
    expect(doc.markdown).toContain("unique to page 1");
    expect(doc.markdown).toContain("unique to page 3");
    // Bare page-number lines should be gone.
    expect(doc.markdown.split("\n")).not.toContain("2");
  });

  it("parses a page mixing heading, paragraph, list and table", async () => {
    const doc = await parseDocument(await mixedPdf());
    const types = new Set(doc.blocks.map(typeOf));
    expect(types.has("heading")).toBe(true);
    expect(types.has("paragraph")).toBe(true);
    expect(types.has("list")).toBe(true);
    expect(types.has("table")).toBe(true);
  });

  it("flags an image-only page with a warning and hasText=false", async () => {
    const doc = await parseDocument(await emptyPdf());
    expect(doc.meta.hasText).toBe(false);
    expect(doc.blocks).toHaveLength(0);
    expect(doc.meta.warnings.some((w) => /no extractable text/i.test(w))).toBe(true);
  });

  it("detects a monospace run as a code block and fences it in Markdown", async () => {
    const doc = await parseDocument(await codePdf());
    const code = doc.blocks.find((b) => b.type === "code") as
      | Extract<Block, { type: "code" }>
      | undefined;
    expect(code).toBeDefined();
    expect(code!.text).toContain("return a + b;");
    expect(doc.markdown).toContain("```");
  });

  it("detects an italic, indented run as a block quote", async () => {
    const doc = await parseDocument(await quotePdf());
    const quote = doc.blocks.find((b) => b.type === "quote") as
      | Extract<Block, { type: "quote" }>
      | undefined;
    expect(quote).toBeDefined();
    expect(quote!.text).toMatch(/fear/i);
    expect(doc.markdown).toContain("> ");
  });

  it("reconstructs a line-ruled table, keeping multi-word cells intact", async () => {
    const doc = await parseDocument(await ruledTablePdf());
    const table = doc.blocks.find((b) => b.type === "table") as
      | Extract<Block, { type: "table" }>
      | undefined;
    expect(table).toBeDefined();
    // Borders define the columns, so "Item Name" is NOT split at its space.
    expect(table!.rows[0]).toEqual(["Item Name", "Unit Price", "In Stock"]);
    expect(table!.rows).toContainEqual(["Mega Gadget", "8 USD", "No"]);
    expect(doc.markdown).toContain("| Item Name | Unit Price | In Stock |");
  });
});
