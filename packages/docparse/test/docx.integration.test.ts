import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/index.js";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function tinyDocx(): Uint8Array {
  const document = `<w:document ${W}><w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Report</w:t></w:r></w:p>
    <w:p><w:r><w:t>A short paragraph of body text in a Word document.</w:t></w:r></w:p>
  </w:body></w:document>`;
  const styles = `<w:styles ${W}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`;
  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types/>'),
    "word/document.xml": strToU8(document),
    "word/styles.xml": strToU8(styles),
  });
}

describe("parseDocument (DOCX route)", () => {
  it("autodetects DOCX from the zip signature and parses it", async () => {
    const doc = await parseDocument(tinyDocx());
    expect(doc.meta.format).toBe("docx");
    expect(doc.meta.pageCount).toBe(1);
    expect(doc.meta.hasText).toBe(true);
    expect(doc.meta.title).toBe("Report");
    expect(doc.markdown).toContain("# Report");
    expect(doc.markdown).toContain("body text");
  });

  it("produces RAG chunks from a DOCX with the heading path", async () => {
    const doc = await parseDocument(tinyDocx());
    const chunks = doc.chunks({ maxTokens: 256 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]!.path).toContain("Report");
  });

  it("can be forced to the docx backend via options.format", async () => {
    const doc = await parseDocument(tinyDocx(), { format: "docx" });
    expect(doc.blocks[0]).toMatchObject({ type: "heading", level: 1, text: "Report" });
  });
});
