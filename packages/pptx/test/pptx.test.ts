import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { toMarkdown, type Block } from "@docmarrow/core";
import { analyzePptx } from "../src/index.js";

const P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const PRESENTATION = `<?xml version="1.0"?>
<p:presentation ${P} ${R}><p:sldIdLst>
<p:sldId id="256" r:id="rId1"/>
<p:sldId id="257" r:id="rId2"/>
</p:sldIdLst></p:presentation>`;

const PRES_RELS = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Target="slides/slide1.xml"/>
<Relationship Id="rId2" Target="slides/slide2.xml"/>
</Relationships>`;

// Helpers to build a shape with a placeholder type and paragraphs.
const para = (text: string, lvl?: number): string =>
  `<a:p>${lvl ? `<a:pPr lvl="${lvl}"/>` : ""}<a:r><a:t>${text}</a:t></a:r></a:p>`;
const shape = (phType: string | null, ...paras: string[]): string =>
  `<p:sp><p:nvSpPr><p:nvPr>${phType ? `<p:ph type="${phType}"/>` : "<p:ph/>"}</p:nvPr></p:nvSpPr>` +
  `<p:txBody>${paras.join("")}</p:txBody></p:sp>`;

const SLIDE1 = `<?xml version="1.0"?>
<p:sld ${P} ${A}><p:cSld><p:spTree>
${shape("title", para("Roadmap"))}
${shape("body", para("Ship 1.0"), para("Then iterate", 1), para("Gather feedback"))}
</p:spTree></p:cSld></p:sld>`;

const tableCell = (t: string): string =>
  `<a:tc><a:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></a:txBody></a:tc>`;
const SLIDE2 = `<?xml version="1.0"?>
<p:sld ${P} ${A}><p:cSld><p:spTree>
${shape("title", para("Metrics"))}
<p:graphicFrame><a:graphic><a:graphicData><a:tbl>
<a:tr>${tableCell("KPI")}${tableCell("Value")}</a:tr>
<a:tr>${tableCell("Users")}${tableCell("1000")}</a:tr>
</a:tbl></a:graphicData></a:graphic></p:graphicFrame>
</p:spTree></p:cSld></p:sld>`;

const CORE = `<?xml version="1.0"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>Deck Title</dc:title></cp:coreProperties>`;

export function makePptx(parts?: Partial<Record<string, string>>): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types/>'),
    "ppt/presentation.xml": strToU8(parts?.presentation ?? PRESENTATION),
    "ppt/_rels/presentation.xml.rels": strToU8(parts?.rels ?? PRES_RELS),
    "ppt/slides/slide1.xml": strToU8(parts?.slide1 ?? SLIDE1),
    "ppt/slides/slide2.xml": strToU8(parts?.slide2 ?? SLIDE2),
    "docProps/core.xml": strToU8(parts?.core ?? CORE),
  });
}

describe("analyzePptx", () => {
  const { blocks, title, warnings } = analyzePptx(makePptx());
  const headings = blocks.filter((b) => b.type === "heading") as Extract<Block, { type: "heading" }>[];

  it("reads the deck title from core.xml", () => {
    expect(title).toBe("Deck Title");
    expect(warnings).toEqual([]);
  });

  it("uses each slide's title placeholder as a level-1 heading, in order", () => {
    expect(headings.map((h) => h.text)).toEqual(["Roadmap", "Metrics"]);
    expect(headings.every((h) => h.level === 1)).toBe(true);
  });

  it("turns a body placeholder into a nested bullet list", () => {
    const list = blocks.find((b) => b.type === "list") as Extract<Block, { type: "list" }>;
    expect(list.ordered).toBe(false);
    expect(list.items.map((i) => i.text)).toEqual(["Ship 1.0", "Then iterate", "Gather feedback"]);
    expect(list.items[1]!.level).toBe(1);
  });

  it("reconstructs a slide table", () => {
    const table = blocks.find((b) => b.type === "table") as Extract<Block, { type: "table" }>;
    expect(table.rows).toEqual([
      ["KPI", "Value"],
      ["Users", "1000"],
    ]);
  });

  it("falls back to 'Slide N' when a slide has no title placeholder", () => {
    const noTitle = `<?xml version="1.0"?><p:sld ${P} ${A}><p:cSld><p:spTree>` +
      `${shape("body", para("Just body text here"), para("second line"))}` +
      `</p:spTree></p:cSld></p:sld>`;
    const res = analyzePptx(makePptx({ slide1: noTitle }));
    const h = res.blocks.find((b) => b.type === "heading") as Extract<Block, { type: "heading" }>;
    expect(h.text).toBe("Slide 1");
  });

  it("serializes slides to Markdown", () => {
    const md = toMarkdown(blocks);
    expect(md).toContain("# Roadmap");
    expect(md).toContain("- Ship 1.0");
    expect(md).toContain("  - Then iterate");
    expect(md).toContain("# Metrics");
    expect(md).toContain("| KPI | Value |");
  });

  it("throws on non-PPTX bytes", () => {
    expect(() => analyzePptx(new Uint8Array([1, 2, 3, 4]))).toThrow(/PPTX/);
  });
});
