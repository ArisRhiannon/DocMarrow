import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { analyzeXlsx } from "../src/index.js";

const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const PKG = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
const XDR =
  'xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 3, 1, 4, 1, 5]);

function xlsxWithImage(): Uint8Array {
  const wb = `<workbook ${R}><sheets><sheet name="Data" r:id="rId1"/></sheets></workbook>`;
  const wbRels = `<Relationships ${PKG}><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>`;
  const sheet =
    `<worksheet ${R}><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData>` +
    `<drawing r:id="rId2"/></worksheet>`;
  const sheetRels = `<Relationships ${PKG}><Relationship Id="rId2" Type="drawing" Target="../drawings/drawing1.xml"/></Relationships>`;
  const drawing =
    `<xdr:wsDr ${XDR}><xdr:twoCellAnchor><xdr:pic>` +
    `<xdr:nvPicPr><xdr:cNvPr id="2" name="Picture 1" descr="Sales chart"/></xdr:nvPicPr>` +
    `<xdr:blipFill><a:blip r:embed="rIdImg"/></xdr:blipFill>` +
    `</xdr:pic></xdr:twoCellAnchor></xdr:wsDr>`;
  const drawingRels = `<Relationships ${PKG}><Relationship Id="rIdImg" Type="image" Target="../media/image1.png"/></Relationships>`;
  return zipSync({
    "xl/workbook.xml": strToU8(wb),
    "xl/_rels/workbook.xml.rels": strToU8(wbRels),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
    "xl/worksheets/_rels/sheet1.xml.rels": strToU8(sheetRels),
    "xl/drawings/drawing1.xml": strToU8(drawing),
    "xl/drawings/_rels/drawing1.xml.rels": strToU8(drawingRels),
    "xl/media/image1.png": PNG_BYTES,
  });
}

describe("XLSX image extraction", () => {
  it("emits a FigureBlock per sheet picture with media bytes and alt", () => {
    const blocks = analyzeXlsx(xlsxWithImage()).blocks;
    expect(blocks.map((b) => b.type)).toEqual(["heading", "table", "figure"]);
    const fig = blocks[2]!;
    expect(fig).toMatchObject({
      type: "figure",
      ref: "xl/media/image1.png",
      mime: "image/png",
      alt: "Sales chart",
    });
    expect(fig.type === "figure" && Array.from(fig.bytes ?? [])).toEqual(Array.from(PNG_BYTES));
  });
});
