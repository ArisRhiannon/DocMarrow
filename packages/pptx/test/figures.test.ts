import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { analyzePptx } from "../src/index.js";

const PKG = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
const PNS =
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 8, 7, 6]);

function pptxWithImage(descr = 'descr="Revenue by region"'): Uint8Array {
  const presentation = `<p:presentation ${PNS}><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`;
  const presRels = `<Relationships ${PKG}><Relationship Id="rId1" Type="slide" Target="slides/slide1.xml"/></Relationships>`;
  const slide =
    `<p:sld ${PNS}><p:cSld><p:spTree>` +
    `<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>` +
    `<p:txBody><a:p><a:r><a:t>Quarter Results</a:t></a:r></a:p></p:txBody></p:sp>` +
    `<p:pic><p:nvPicPr><p:cNvPr id="4" name="Picture 3" ${descr}/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="rId2"/></p:blipFill></p:pic>` +
    `</p:spTree></p:cSld></p:sld>`;
  const slideRels = `<Relationships ${PKG}><Relationship Id="rId2" Type="image" Target="../media/image1.png"/></Relationships>`;
  return zipSync({
    "ppt/presentation.xml": strToU8(presentation),
    "ppt/_rels/presentation.xml.rels": strToU8(presRels),
    "ppt/slides/slide1.xml": strToU8(slide),
    "ppt/slides/_rels/slide1.xml.rels": strToU8(slideRels),
    "ppt/media/image1.png": PNG_BYTES,
  });
}

describe("PPTX figure extraction", () => {
  it("emits a FigureBlock after the slide title with media bytes and alt", () => {
    const blocks = analyzePptx(pptxWithImage()).blocks;
    expect(blocks.map((b) => b.type)).toEqual(["heading", "figure"]);
    const fig = blocks[1]!;
    expect(fig).toMatchObject({
      type: "figure",
      ref: "ppt/media/image1.png",
      mime: "image/png",
      alt: "Revenue by region",
    });
    expect(fig.type === "figure" && Array.from(fig.bytes ?? [])).toEqual(Array.from(PNG_BYTES));
  });

  it("falls back to the picture name when there is no descr", () => {
    const blocks = analyzePptx(pptxWithImage("")).blocks;
    expect(blocks[1]).toMatchObject({ type: "figure", alt: "Picture 3" });
  });
});
