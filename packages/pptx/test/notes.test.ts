import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { analyzePptx } from "../src/index.js";

const PKG = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
const PNS =
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function pptxWithNotes(): Uint8Array {
  const presentation = `<p:presentation ${PNS}><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`;
  const presRels = `<Relationships ${PKG}><Relationship Id="rId1" Type="slide" Target="slides/slide1.xml"/></Relationships>`;
  const slide =
    `<p:sld ${PNS}><p:cSld><p:spTree>` +
    `<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>` +
    `<p:txBody><a:p><a:r><a:t>Quarter Results</a:t></a:r></a:p></p:txBody></p:sp>` +
    `</p:spTree></p:cSld></p:sld>`;
  const slideRels =
    `<Relationships ${PKG}>` +
    `<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>` +
    `</Relationships>`;
  const notes =
    `<p:notes ${PNS}><p:cSld><p:spTree>` +
    `<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>` +
    `<p:txBody><a:p><a:r><a:t>Remember to mention Q4 churn.</a:t></a:r></a:p>` +
    `<a:p><a:r><a:t>Skip the appendix.</a:t></a:r></a:p></p:txBody></p:sp>` +
    `</p:spTree></p:cSld></p:notes>`;
  return zipSync({
    "ppt/presentation.xml": strToU8(presentation),
    "ppt/_rels/presentation.xml.rels": strToU8(presRels),
    "ppt/slides/slide1.xml": strToU8(slide),
    "ppt/slides/_rels/slide1.xml.rels": strToU8(slideRels),
    "ppt/notesSlides/notesSlide1.xml": strToU8(notes),
  });
}

describe("PPTX speaker notes (opt-in)", () => {
  it("does not extract notes by default", () => {
    const blocks = analyzePptx(pptxWithNotes()).blocks;
    expect(blocks.some((b) => b.type === "quote")).toBe(false);
  });

  it("appends notes as a quote block when speakerNotes is enabled", () => {
    const blocks = analyzePptx(pptxWithNotes(), { speakerNotes: true }).blocks;
    const quote = blocks.find((b) => b.type === "quote");
    expect(quote).toBeTruthy();
    if (quote && quote.type === "quote") {
      expect(quote.text).toBe("Remember to mention Q4 churn.\nSkip the appendix.");
    }
    // notes come after the slide heading
    expect(blocks.map((b) => b.type)).toEqual(["heading", "quote"]);
  });
});
