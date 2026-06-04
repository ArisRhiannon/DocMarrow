import type { BBox, Block, BlockType, ListItemNode } from "../types.js";

/** Uniform JSON node: one entry per block with type/page/bbox/confidence + content. */
export interface ContentNode {
  type: BlockType;
  page: number;
  bbox: BBox;
  confidence: number;
  /** Block-specific payload: string, list items, or table rows. */
  content: string | ListItemNode[] | string[][];
  /** Present on headings. */
  level?: number;
  /** Present on lists. */
  ordered?: boolean;
}

function contentOf(block: Block): ContentNode["content"] {
  switch (block.type) {
    case "heading":
    case "paragraph":
    case "code":
    case "quote":
      return block.text;
    case "list":
      return block.items;
    case "table":
      return block.rows;
  }
}

/** Map structured blocks to a flat, uniform JSON tree for pipelines/citations. */
export function toContentTree(blocks: Block[]): ContentNode[] {
  return blocks.map((block) => {
    const node: ContentNode = {
      type: block.type,
      page: block.page,
      bbox: block.bbox,
      confidence: block.confidence,
      content: contentOf(block),
    };
    if (block.type === "heading") node.level = block.level;
    if (block.type === "list") node.ordered = block.ordered;
    return node;
  });
}
