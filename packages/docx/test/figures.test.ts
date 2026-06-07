import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { analyzeDocx } from "../src/index.js";

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6]);

function docxWithImage(): Uint8Array {
  const document =
    `<w:document ${NS}><w:body>` +
    `<w:p><w:r><w:t>Intro paragraph before the figure.</w:t></w:r></w:p>` +
    `<w:p><w:r><w:drawing><wp:inline>` +
    `<wp:docPr id="1" name="Picture 1" descr="A quarterly revenue chart"/>` +
    `<a:graphic><a:graphicData><pic:pic><pic:blipFill>` +
    `<a:blip r:embed="rId1"/>` +
    `</pic:blipFill></pic:pic></a:graphicData></a:graphic>` +
    `</wp:inline></w:drawing></w:r></w:p>` +
    `</w:body></w:document>`;
  const rels =
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>` +
    `</Relationships>`;
  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types/>'),
    "word/document.xml": strToU8(document),
    "word/_rels/document.xml.rels": strToU8(rels),
    "word/media/image1.png": PNG_BYTES,
  });
}

describe("DOCX figure extraction", () => {
  it("emits a FigureBlock in document order with media bytes and alt text", () => {
    const blocks = analyzeDocx(docxWithImage()).blocks;
    const types = blocks.map((b) => b.type);
    expect(types).toEqual(["paragraph", "figure"]);
    const fig = blocks[1]!;
    expect(fig).toMatchObject({
      type: "figure",
      ref: "word/media/image1.png",
      mime: "image/png",
      alt: "A quarterly revenue chart",
    });
    expect(fig.type === "figure" && Array.from(fig.bytes ?? [])).toEqual(Array.from(PNG_BYTES));
  });

  it("falls back to the picture name when there is no descr", () => {
    const doc = docxWithImage();
    const blocks = analyzeDocx(
      zipSync({
        "word/document.xml": strToU8(
          `<w:document ${NS}><w:body><w:p><w:r><w:drawing><wp:inline>` +
            `<wp:docPr id="2" name="Logo"/>` +
            `<a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId1"/>` +
            `</pic:blipFill></pic:pic></a:graphicData></a:graphic>` +
            `</wp:inline></w:drawing></w:r></w:p></w:body></w:document>`,
        ),
        "word/_rels/document.xml.rels": strToU8(
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
            `<Relationship Id="rId1" Type="img" Target="media/image1.png"/></Relationships>`,
        ),
        "word/media/image1.png": PNG_BYTES,
      }),
    ).blocks;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "figure", alt: "Logo" });
    void doc;
  });
});
