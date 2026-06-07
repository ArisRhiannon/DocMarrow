import { describe, expect, it } from "vitest";
import { analyzeHtml } from "../src/index.js";

const figs = (html: string) =>
  analyzeHtml(html).blocks.filter((b) => b.type === "figure") as Array<
    Extract<ReturnType<typeof analyzeHtml>["blocks"][number], { type: "figure" }>
  >;

describe("HTML <img> → FigureBlock", () => {
  it("captures a standalone image with its src as ref and alt text", () => {
    const [f] = figs(`<body><img src="charts/sales.png" alt="Q3 sales chart"></body>`);
    expect(f).toMatchObject({ type: "figure", ref: "charts/sales.png", alt: "Q3 sales chart", mime: "image/png" });
    expect(f!.bytes).toBeUndefined();
  });

  it("decodes a data: URI into bytes + mime and keeps the ref short", () => {
    const [f] = figs(`<body><img alt="dot" src="data:image/png;base64,AAECAwQ="></body>`);
    expect(f).toMatchObject({ type: "figure", ref: "data:image/png", mime: "image/png", alt: "dot" });
    expect(Array.from(f!.bytes ?? [])).toEqual([0, 1, 2, 3, 4]);
  });

  it("extracts the image inside a <figure> and keeps the caption as text", () => {
    const blocks = analyzeHtml(
      `<body><figure><img src="a.svg" alt="arch"><figcaption>Figure 1</figcaption></figure></body>`,
    ).blocks;
    expect(blocks.some((b) => b.type === "figure")).toBe(true);
    expect(blocks.some((b) => b.type === "paragraph" && b.text.includes("Figure 1"))).toBe(true);
  });

  it("captures an image nested inside a paragraph", () => {
    const blocks = analyzeHtml(`<body><p>See <img src="x.gif" alt="x"> here.</p></body>`).blocks;
    expect(blocks.some((b) => b.type === "paragraph")).toBe(true);
    expect(blocks.some((b) => b.type === "figure" && b.ref === "x.gif" && b.mime === "image/gif")).toBe(true);
  });

  it("skips an image with no usable source", () => {
    expect(figs(`<body><img alt="broken"></body>`)).toHaveLength(0);
  });
});
