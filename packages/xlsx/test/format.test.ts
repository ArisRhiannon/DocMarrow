import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { analyzeXlsx } from "../src/index.js";

const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const PKG = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';

/** Workbook with one sheet: a date (serial 45292), a percent (0.25) and a plain number. */
function workbook(): Uint8Array {
  const wb = `<workbook ${R}><sheets><sheet name="Data" r:id="rId1"/></sheets></workbook>`;
  const wbRels = `<Relationships ${PKG}><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>`;
  const styles =
    `<styleSheet><cellXfs count="3">` +
    `<xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="9"/>` +
    `</cellXfs></styleSheet>`;
  const sheet =
    `<worksheet><sheetData><row r="1">` +
    `<c r="A1" s="1"><v>45292</v></c>` + // date
    `<c r="B1" s="2"><v>0.25</v></c>` + // percent
    `<c r="C1" s="0"><v>42</v></c>` + // plain number
    `</row></sheetData></worksheet>`;
  return zipSync({
    "xl/workbook.xml": strToU8(wb),
    "xl/_rels/workbook.xml.rels": strToU8(wbRels),
    "xl/styles.xml": strToU8(styles),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });
}

describe("XLSX number/date formatting (numFmt)", () => {
  it("renders date serials as ISO dates and percent as %, leaving plain numbers raw", () => {
    const table = analyzeXlsx(workbook()).blocks.find((b) => b.type === "table")!;
    expect(table.type).toBe("table");
    if (table.type === "table") {
      expect(table.rows[0]).toEqual(["2024-01-01", "25%", "42"]);
    }
  });
});
