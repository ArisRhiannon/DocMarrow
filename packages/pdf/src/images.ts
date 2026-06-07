import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { BBox, FigureRef } from "@docmarrow/core";
import { applyX, applyY, compose, IDENTITY, type Matrix } from "./matrix.js";

/** Operators that paint a raster image into the current unit square. */
const IMAGE_OPS = new Set<number>([
  OPS.paintImageXObject,
  OPS.paintInlineImageXObject,
  OPS.paintImageMaskXObject,
]);

/** Axis-aligned bbox (top-left convention) of the unit square under `ctm`. */
function unitSquareBBox(ctm: Matrix, pageHeight: number): BBox {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [ux, uy] of [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ] as const) {
    xs.push(applyX(ctm, ux, uy));
    ys.push(pageHeight - applyY(ctm, ux, uy));
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * Locate embedded raster images (figures) on a page from its operator list.
 *
 * pdf.js draws every image into the unit square `[0,1]²` under the current
 * transform, so the on-page rectangle is that square mapped through the CTM —
 * exactly the same CTM bookkeeping the rule extractor does. We deliberately do
 * NOT decode the pixels: turning a PDF image XObject into PNG bytes needs a
 * canvas (a heavy/native dep), so that is left to the opt-in describe/OCR path.
 * Here we only report *where* each figure is and a stable per-page `ref`.
 *
 * Images smaller than `minSize` points on either side are skipped as noise
 * (hairline spacers, bullet glyphs drawn as 1px images, etc.).
 */
export function extractImages(
  opList: { fnArray: number[]; argsArray: unknown[] },
  pageHeight: number,
  page: number,
  options: { minSize?: number } = {},
): FigureRef[] {
  const minSize = options.minSize ?? 16;
  const { fnArray, argsArray } = opList;

  let ctm: Matrix = [...IDENTITY];
  const stack: Matrix[] = [];
  const figures: FigureRef[] = [];
  let count = 0;

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    if (fn === OPS.save) {
      stack.push([...ctm]);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() ?? [...IDENTITY];
    } else if (fn === OPS.transform) {
      const a = argsArray[i] as number[];
      if (a && a.length >= 6) {
        ctm = compose([a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!], ctm);
      }
    } else if (fn !== undefined && IMAGE_OPS.has(fn)) {
      const bbox = unitSquareBBox(ctm, pageHeight);
      if (bbox.width >= minSize && bbox.height >= minSize) {
        count += 1;
        figures.push({ bbox, ref: `p${page}-img${count}` });
      }
    }
  }
  return figures;
}
