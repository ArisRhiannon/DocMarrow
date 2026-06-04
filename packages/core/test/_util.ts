import type { PageInput, TextItem } from "../src/index.js";

export interface ItemOpts {
  fontSize?: number;
  width?: number;
  bold?: boolean;
  italic?: boolean;
}

/** Build a TextItem with sensible derived defaults (top-left origin). */
export function item(text: string, x: number, y: number, opts: ItemOpts = {}): TextItem {
  const fontSize = opts.fontSize ?? 12;
  return {
    text,
    x,
    y,
    width: opts.width ?? text.length * fontSize * 0.5,
    height: fontSize,
    fontSize,
    bold: opts.bold ?? false,
    italic: opts.italic ?? false,
  };
}

export function page(items: TextItem[], width = 600, height = 800): PageInput {
  return { width, height, items };
}
