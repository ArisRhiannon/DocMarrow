import { toMarkdown } from "@docmarrow/core";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { analyzeDocx } from "../src/index.js";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

/** A DOCX whose single list is decimal at level 0 and bullet at level 1. */
function mixedListDocx(): Uint8Array {
  const li = (ilvl: number, text: string) =>
    `<w:p><w:pPr><w:numPr><w:numId w:val="1"/><w:ilvl w:val="${ilvl}"/></w:numPr></w:pPr>` +
    `<w:r><w:t>${text}</w:t></w:r></w:p>`;
  const document = `<w:document ${W}><w:body>${li(0, "Step one")}${li(1, "sub bullet")}${li(0, "Step two")}</w:body></w:document>`;
  const numbering =
    `<w:numbering ${W}>` +
    `<w:abstractNum w:abstractNumId="0">` +
    `<w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl>` +
    `<w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl>` +
    `</w:abstractNum>` +
    `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>` +
    `</w:numbering>`;
  return zipSync({
    "word/document.xml": strToU8(document),
    "word/numbering.xml": strToU8(numbering),
  });
}

describe("DOCX mixed-level numbering (ordered per item)", () => {
  it("marks decimal levels ordered and bullet levels unordered", () => {
    const list = analyzeDocx(mixedListDocx()).blocks.find((b) => b.type === "list")!;
    expect(list.type).toBe("list");
    if (list.type === "list") {
      expect(list.items.map((i) => `${i.level}:${i.ordered ? "o" : "u"}`)).toEqual(["0:o", "1:u", "0:o"]);
    }
  });

  it("serializes the sublevel as a bullet under the numbered items", () => {
    const md = toMarkdown(analyzeDocx(mixedListDocx()).blocks).trim();
    expect(md).toBe(["1. Step one", "  - sub bullet", "2. Step two"].join("\n"));
  });
});
