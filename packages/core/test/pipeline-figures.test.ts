import { describe, expect, it } from "vitest";
import { analyze, type PageInput, type TextItem } from "../src/index.js";

const line = (text: string, y: number): TextItem => ({
  text,
  x: 50,
  y,
  width: text.length * 6,
  height: 12,
  fontSize: 12,
});

describe("pipeline weaves page figures into the block stream", () => {
  it("orders figures above and below the text by vertical position", () => {
    const page: PageInput = {
      width: 600,
      height: 800,
      items: [line("The only paragraph of body text on the page.", 300)],
      figures: [
        { bbox: { x: 50, y: 480, width: 200, height: 80 }, ref: "below", alt: "", mime: "image/png" },
        { bbox: { x: 50, y: 40, width: 200, height: 80 }, ref: "above", alt: "" },
      ],
    };
    const { blocks } = analyze([page]);
    const seq = blocks.map((b) => (b.type === "figure" ? `fig:${b.ref}` : b.type));
    expect(seq).toEqual(["fig:above", "paragraph", "fig:below"]);
    const below = blocks.find((b) => b.type === "figure" && b.ref === "below");
    expect(below).toMatchObject({ page: 1, mime: "image/png" });
  });

  it("carries source alt and bytes through, even on an otherwise empty page", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const page: PageInput = {
      width: 600,
      height: 800,
      items: [],
      figures: [{ bbox: { x: 0, y: 0, width: 10, height: 10 }, ref: "p1-img1", alt: "logo", bytes }],
    };
    const { blocks } = analyze([page]);
    expect(blocks).toHaveLength(1);
    const fb = blocks[0]!;
    expect(fb).toMatchObject({ type: "figure", alt: "logo", ref: "p1-img1" });
    expect(fb.type === "figure" && fb.bytes).toBe(bytes);
  });
});
