import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { toMarkdown, type Block } from "@docmarrow/core";
import { analyzeXlsx } from "../src/index.js";

const REL = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const WORKBOOK = `<?xml version="1.0"?>
<workbook ${REL}><sheets>
<sheet name="Sales" sheetId="1" r:id="rId1"/>
<sheet name="Summary" sheetId="2" r:id="rId2"/>
</sheets></workbook>`;

const WB_RELS = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Target="worksheets/sheet2.xml"/>
</Relationships>`;

// Shared strings: 0=Region, 1=Units, 2=North, 3=South
const SHARED = `<?xml version="1.0"?>
<sst><si><t>Region</t></si><si><t>Units</t></si><si><t>North</t></si><si><t>South</t></si></sst>`;

// Sheet1: header (shared strings) + two data rows (string ref + number).
const SHEET1 = `<?xml version="1.0"?>
<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>120</v></c></row>
<row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"><v>98</v></c></row>
</sheetData></worksheet>`;

// Sheet2: an inline string and a boolean, starting at B2 (used-range trim).
const SHEET2 = `<?xml version="1.0"?>
<worksheet><sheetData>
<row r="2"><c r="B2" t="inlineStr"><is><t>Total</t></is></c><c r="C2" t="b"><v>1</v></c></row>
</sheetData></worksheet>`;

const CORE = `<?xml version="1.0"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>Q1 Workbook</dc:title></cp:coreProperties>`;

export function makeXlsx(parts?: Partial<Record<string, string>>): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types/>'),
    "xl/workbook.xml": strToU8(parts?.workbook ?? WORKBOOK),
    "xl/_rels/workbook.xml.rels": strToU8(parts?.rels ?? WB_RELS),
    "xl/sharedStrings.xml": strToU8(parts?.shared ?? SHARED),
    "xl/worksheets/sheet1.xml": strToU8(parts?.sheet1 ?? SHEET1),
    "xl/worksheets/sheet2.xml": strToU8(parts?.sheet2 ?? SHEET2),
    "docProps/core.xml": strToU8(parts?.core ?? CORE),
  });
}

describe("analyzeXlsx", () => {
  const { blocks, title, warnings } = analyzeXlsx(makeXlsx());
  const headings = blocks.filter((b) => b.type === "heading") as Extract<Block, { type: "heading" }>[];
  const tables = blocks.filter((b) => b.type === "table") as Extract<Block, { type: "table" }>[];

  it("reads the workbook title from core.xml", () => {
    expect(title).toBe("Q1 Workbook");
    expect(warnings).toEqual([]);
  });

  it("emits a level-2 heading per non-empty sheet, in workbook order", () => {
    expect(headings.map((h) => h.text)).toEqual(["Sales", "Summary"]);
    expect(headings.every((h) => h.level === 2)).toBe(true);
  });

  it("resolves shared strings and numbers into the first sheet's grid", () => {
    expect(tables[0]!.rows).toEqual([
      ["Region", "Units"],
      ["North", "120"],
      ["South", "98"],
    ]);
  });

  it("handles inline strings and booleans, trimming to the used range", () => {
    // Sheet2 data starts at B2/C2 -> trimmed so it begins at column 0.
    expect(tables[1]!.rows).toEqual([["Total", "TRUE"]]);
  });

  it("serializes sheets to Markdown headings + tables", () => {
    const md = toMarkdown(blocks);
    expect(md).toContain("## Sales");
    expect(md).toContain("| Region | Units |");
    expect(md).toContain("## Summary");
  });

  it("throws on non-XLSX bytes", () => {
    expect(() => analyzeXlsx(new Uint8Array([1, 2, 3, 4]))).toThrow(/XLSX/);
  });

  it("warns when the workbook has no non-empty cells", () => {
    const empty = makeXlsx({
      sheet1: '<?xml version="1.0"?><worksheet><sheetData/></worksheet>',
      sheet2: '<?xml version="1.0"?><worksheet><sheetData/></worksheet>',
    });
    const res = analyzeXlsx(empty);
    expect(res.blocks).toEqual([]);
    expect(res.warnings.some((w) => /no non-empty cells/i.test(w))).toBe(true);
  });
});
