/**
 * Rasterizer abstraction so the OCR engine can render PDF pages to a bitmap in
 * either Node (via the optional native `@napi-rs/canvas`) or the browser (via
 * the DOM `<canvas>`). pdf.js needs `Path2D`/`DOMMatrix`/`ImageData` as globals
 * when rendering in Node; we install them from the native canvas.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CanvasBundle {
  canvas: any;
  ctx: any;
}

export interface Raster {
  create(width: number, height: number): CanvasBundle;
  /** Produce an image input tesseract.js accepts (PNG Buffer in Node, canvas in browser). */
  toOcrImage(bundle: CanvasBundle): unknown;
}

let cached: Raster | null = null;

const isBrowser = (): boolean =>
  typeof globalThis === "object" &&
  typeof (globalThis as any).document !== "undefined" &&
  typeof (globalThis as any).document.createElement === "function";

export async function loadRaster(): Promise<Raster> {
  if (cached) return cached;

  if (isBrowser()) {
    const doc = (globalThis as any).document;
    cached = {
      create(width, height) {
        const canvas = doc.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return { canvas, ctx: canvas.getContext("2d") };
      },
      toOcrImage: (b) => b.canvas,
    };
    return cached;
  }

  let napi: any;
  try {
    napi = await import("@napi-rs/canvas");
  } catch {
    throw new Error(
      "OCR in Node requires the optional '@napi-rs/canvas' dependency to rasterize " +
        "PDF pages. Install it with: npm install @napi-rs/canvas",
    );
  }

  // pdf.js touches these globals while painting; provide them from the native canvas.
  const g = globalThis as any;
  g.Path2D ??= napi.Path2D;
  g.DOMMatrix ??= napi.DOMMatrix;
  g.ImageData ??= napi.ImageData;

  cached = {
    create(width, height) {
      const canvas = napi.createCanvas(width, height);
      return { canvas, ctx: canvas.getContext("2d") };
    },
    toOcrImage: (b) => b.canvas.toBuffer("image/png"),
  };
  return cached;
}
