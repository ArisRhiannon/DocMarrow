import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/index.js";

const REL = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const ct = strToU8('<?xml version="1.0"?><Types/>');

function tinyXlsx(): Uint8Array {
  return zipSync({
    "[Content_Types].xml": ct,
    "xl/workbook.xml": strToU8(`<workbook ${REL}><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    "xl/sharedStrings.xml": strToU8(`<sst><si><t>Name</t></si><si><t>Bob</t></si></sst>`),
    "xl/worksheets/sheet1.xml": strToU8(
      `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row></sheetData></worksheet>`,
    ),
  });
}

function tinyPptx(): Uint8Array {
  const P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
  return zipSync({
    "[Content_Types].xml": ct,
    "ppt/presentation.xml": strToU8(`<p:presentation ${P} ${REL}><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`),
    "ppt/_rels/presentation.xml.rels": strToU8(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>`,
    ),
    "ppt/slides/slide1.xml": strToU8(
      `<p:sld ${P} ${A}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Kickoff</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    ),
  });
}

describe("parseDocument format autodetection", () => {
  it("detects and parses XLSX from the zip contents", async () => {
    const doc = await parseDocument(tinyXlsx());
    expect(doc.meta.format).toBe("xlsx");
    expect(doc.markdown).toContain("## Data");
    expect(doc.markdown).toContain("| Name |");
  });

  it("detects and parses PPTX from the zip contents", async () => {
    const doc = await parseDocument(tinyPptx());
    expect(doc.meta.format).toBe("pptx");
    expect(doc.markdown).toContain("# Kickoff");
  });

  it("detects and parses HTML from a byte sniff", async () => {
    const html = "<!doctype html><html><head><title>Page</title></head><body><h1>Hi</h1><p>there</p></body></html>";
    const doc = await parseDocument(new TextEncoder().encode(html));
    expect(doc.meta.format).toBe("html");
    expect(doc.meta.title).toBe("Page");
    expect(doc.markdown).toContain("# Hi");
    expect(doc.markdown).toContain("there");
  });

  it("still detects PDF, and rejects unrecognised input", async () => {
    await expect(parseDocument(new Uint8Array([1, 2, 3, 4, 5]))).rejects.toThrow(/Unrecognised/);
  });

  it("honours an explicit format option", async () => {
    const html = "<h1>Forced</h1>";
    const doc = await parseDocument(new TextEncoder().encode(html), { format: "html" });
    expect(doc.meta.format).toBe("html");
    expect(doc.blocks[0]).toMatchObject({ type: "heading", text: "Forced" });
  });
});
