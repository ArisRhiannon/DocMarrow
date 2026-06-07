import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/index.js";

const PKG = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
const PNS =
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function pptx(): Uint8Array {
  return zipSync({
    "ppt/presentation.xml": strToU8(
      `<p:presentation ${PNS}><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`,
    ),
    "ppt/_rels/presentation.xml.rels": strToU8(
      `<Relationships ${PKG}><Relationship Id="rId1" Type="slide" Target="slides/slide1.xml"/></Relationships>`,
    ),
    "ppt/slides/slide1.xml": strToU8(
      `<p:sld ${PNS}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>` +
        `<p:txBody><a:p><a:r><a:t>Agenda</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    ),
    "ppt/slides/_rels/slide1.xml.rels": strToU8(
      `<Relationships ${PKG}><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`,
    ),
    "ppt/notesSlides/notesSlide1.xml": strToU8(
      `<p:notes ${PNS}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr>` +
        `<p:txBody><a:p><a:r><a:t>Open with the revenue miss.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`,
    ),
  });
}

describe("parseDocument speakerNotes option (PPTX, end-to-end)", () => {
  it("omits speaker notes by default", async () => {
    const doc = await parseDocument(pptx());
    expect(doc.markdown).not.toContain("Open with the revenue miss.");
  });

  it("includes speaker notes when opted in", async () => {
    const doc = await parseDocument(pptx(), { speakerNotes: true });
    expect(doc.markdown).toContain("> Open with the revenue miss.");
  });
});
