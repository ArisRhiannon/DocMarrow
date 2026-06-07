import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { toMarkdown, type Block } from "@docparse/core";
import { analyzeDocx } from "../src/index.js";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

const para = (text: string, pStyle?: string, preserve = false): string => {
  const pPr = pStyle ? `<w:pPr><w:pStyle w:val="${pStyle}"/></w:pPr>` : "";
  const space = preserve ? ' xml:space="preserve"' : "";
  return `<w:p>${pPr}<w:r><w:t${space}>${text}</w:t></w:r></w:p>`;
};

const listItem = (text: string, numId: number, ilvl: number): string =>
  `<w:p><w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>` +
  `<w:r><w:t>${text}</w:t></w:r></w:p>`;

const cell = (text: string): string =>
  `<w:tc><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
const row = (...cells: string[]): string => `<w:tr>${cells.map(cell).join("")}</w:tr>`;

const DOCUMENT = `<?xml version="1.0" encoding="UTF-8"?>
<w:document ${W}><w:body>
${para("Annual Report", "Title")}
${para("Introduction", "Heading1")}
${para("This is a normal paragraph of body text.")}
${para("Key Results", "Heading2")}
${listItem("First result", 1, 0)}
${listItem("Second result", 1, 0)}
${listItem("Nested detail", 1, 1)}
${listItem("Bullet one", 2, 0)}
${listItem("Bullet two", 2, 0)}
${para("We choose to go to the Moon.", "Quote")}
${para("function add(a, b) {", "HTMLPreformatted")}
${para("  return a + b;", "HTMLPreformatted", true)}
${para("}", "HTMLPreformatted")}
<w:tbl>${row("Name", "Age")}${row("Alice", "30")}</w:tbl>
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>
</w:body></w:document>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles ${W}>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/></w:style>
<w:style w:type="paragraph" w:styleId="HTMLPreformatted"><w:name w:val="HTML Preformatted"/></w:style>
</w:styles>`;

const NUMBERING = `<?xml version="1.0" encoding="UTF-8"?>
<w:numbering ${W}>
<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="lowerLetter"/></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

const CORE = `<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>Annual Report 2025</dc:title></cp:coreProperties>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

/** Assemble a minimal but valid .docx (OOXML zip) from the XML parts above. */
export function makeDocx(parts?: Partial<Record<string, string>>): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8(parts?.contentTypes ?? CONTENT_TYPES),
    "word/document.xml": strToU8(parts?.document ?? DOCUMENT),
    "word/styles.xml": strToU8(parts?.styles ?? STYLES),
    "word/numbering.xml": strToU8(parts?.numbering ?? NUMBERING),
    "docProps/core.xml": strToU8(parts?.core ?? CORE),
  });
}

describe("analyzeDocx", () => {
  const { blocks, title, warnings } = analyzeDocx(makeDocx());
  const byType = (t: Block["type"]): Block[] => blocks.filter((b) => b.type === t);

  it("reads the title from core.xml", () => {
    expect(title).toBe("Annual Report 2025");
    expect(warnings).toEqual([]);
  });

  it("maps the Title style to a level-1 heading", () => {
    const h = blocks[0] as Extract<Block, { type: "heading" }>;
    expect(h).toMatchObject({ type: "heading", level: 1, text: "Annual Report" });
  });

  it("maps Heading1/Heading2 styles to their levels", () => {
    const headings = byType("heading") as Extract<Block, { type: "heading" }>[];
    expect(headings.find((h) => h.text === "Introduction")!.level).toBe(1);
    expect(headings.find((h) => h.text === "Key Results")!.level).toBe(2);
  });

  it("groups a numbered list (ordered) with nesting via ilvl", () => {
    const lists = byType("list") as Extract<Block, { type: "list" }>[];
    const ordered = lists.find((l) => l.ordered)!;
    expect(ordered.items.map((i) => i.text)).toEqual([
      "First result",
      "Second result",
      "Nested detail",
    ]);
    expect(ordered.items[2]!.level).toBe(1);
  });

  it("groups a bulleted list as unordered, separate from the numbered list", () => {
    const lists = byType("list") as Extract<Block, { type: "list" }>[];
    expect(lists).toHaveLength(2);
    const bullet = lists.find((l) => !l.ordered)!;
    expect(bullet.items.map((i) => i.text)).toEqual(["Bullet one", "Bullet two"]);
  });

  it("maps the Quote style to a quote block", () => {
    const quote = byType("quote")[0] as Extract<Block, { type: "quote" }>;
    expect(quote.text).toContain("go to the Moon");
  });

  it("merges consecutive preformatted paragraphs into one code block, keeping indentation", () => {
    const code = byType("code")[0] as Extract<Block, { type: "code" }>;
    expect(code.text.split("\n")).toHaveLength(3);
    expect(code.text).toContain("\n  return a + b;");
  });

  it("reconstructs a table from w:tbl/w:tr/w:tc", () => {
    const table = byType("table")[0] as Extract<Block, { type: "table" }>;
    expect(table.rows).toEqual([
      ["Name", "Age"],
      ["Alice", "30"],
    ]);
  });

  it("serializes the whole document to coherent Markdown", () => {
    const md = toMarkdown(blocks);
    expect(md).toContain("# Annual Report");
    expect(md).toContain("## Key Results");
    expect(md).toContain("1. First result");
    expect(md).toContain("- Bullet one");
    expect(md).toContain("> We choose to go to the Moon.");
    expect(md).toContain("| Name | Age |");
  });

  it("throws a clear error on non-DOCX bytes", () => {
    expect(() => analyzeDocx(new Uint8Array([1, 2, 3, 4]))).toThrow(/DOCX/);
  });

  it("warns when the document body has no text", () => {
    const empty = makeDocx({ document: `<w:document ${W}><w:body></w:body></w:document>` });
    const res = analyzeDocx(empty);
    expect(res.blocks).toEqual([]);
    expect(res.warnings.some((w) => /no extractable text/i.test(w))).toBe(true);
  });
});

describe("analyzeDocx edge cases", () => {
  it("groups list items even with no numbering.xml (defaults to unordered)", () => {
    const document = `<w:document ${W}><w:body>
      ${listItem("First", 1, 0)}${listItem("Second", 1, 0)}
    </w:body></w:document>`;
    const docx = makeDocx({ document, numbering: "" });
    const { blocks } = analyzeDocx(docx);
    const list = blocks.find((b) => b.type === "list") as Extract<Block, { type: "list" }>;
    expect(list.items.map((i) => i.text)).toEqual(["First", "Second"]);
    expect(list.ordered).toBe(false);
  });

  it("treats a paragraph carrying outlineLvl as a heading", () => {
    const document = `<w:document ${W}><w:body>
      <w:p><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:r><w:t>Outline Heading</w:t></w:r></w:p>
    </w:body></w:document>`;
    const { blocks } = analyzeDocx(makeDocx({ document, styles: "" }));
    expect(blocks[0]).toMatchObject({ type: "heading", level: 3, text: "Outline Heading" });
  });

  it("collects text from runs nested inside a hyperlink", () => {
    const document = `<w:document ${W}><w:body>
      <w:p><w:r><w:t>See </w:t></w:r><w:hyperlink r:id="rId1"><w:r><w:t>the link</w:t></w:r></w:hyperlink><w:r><w:t> for details.</w:t></w:r></w:p>
    </w:body></w:document>`;
    const { blocks } = analyzeDocx(makeDocx({ document }));
    const para = blocks.find((b) => b.type === "paragraph") as Extract<Block, { type: "paragraph" }>;
    expect(para.text).toBe("See the link for details.");
  });

  it("preserves an explicit line break inside a paragraph run", () => {
    const document = `<w:document ${W}><w:body>
      <w:p><w:r><w:t>line one</w:t><w:br/><w:t>line two</w:t></w:r></w:p>
    </w:body></w:document>`;
    const { blocks } = analyzeDocx(makeDocx({ document }));
    const para = blocks.find((b) => b.type === "paragraph") as Extract<Block, { type: "paragraph" }>;
    // In prose the break collapses to a space (Markdown paragraph semantics).
    expect(para.text).toBe("line one line two");
  });
});
