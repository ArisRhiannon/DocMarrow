import { unionBBox } from "./layout.js";
import { toMarkdown } from "./serialize/markdown.js";
import type { Block, Chunk, ChunkOptions } from "./types.js";

/**
 * Rough token estimate. This is a heuristic (≈ words / 0.75), NOT a real BPE
 * tokenizer; counts will differ from a model's tokenizer. It is deterministic
 * and dependency-free, which is what the chunker needs for stable boundaries.
 */
export function estimateTokens(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return Math.ceil(t.split(/\s+/).length / 0.75);
}

interface Unit {
  text: string;
  tokens: number;
  page: number;
  block: Block;
  /** Heading breadcrumb active at this unit (after its own heading update). */
  path: string[];
}

/**
 * Chunk blocks for RAG ingestion.
 *
 * Blocks are atomic: a paragraph or table is never split across chunks. A block
 * that on its own exceeds `maxTokens` becomes a single oversized chunk rather
 * than being broken mid-structure. Consecutive chunks overlap by whole trailing
 * blocks whose token sum fits within `overlap`.
 */
export function chunkBlocks(blocks: Block[], options: ChunkOptions = {}): Chunk[] {
  const maxTokens = options.maxTokens ?? 512;
  const overlap = options.overlap ?? 64;
  const count = options.countTokens ?? estimateTokens;

  const headingPath: string[] = [];
  const units: Unit[] = blocks.map((block) => {
    if (block.type === "heading") {
      const lvl = block.level;
      headingPath.length = Math.min(headingPath.length, lvl - 1);
      headingPath[lvl - 1] = block.text;
      headingPath.length = lvl;
    }
    const text = toMarkdown([block]).trim();
    return { text, tokens: count(text), page: block.page, block, path: [...headingPath] };
  });

  const chunks: Chunk[] = [];
  let current: Unit[] = [];

  const flush = (): void => {
    if (current.length === 0) return;
    chunks.push(makeChunk(current, count));
    current = [...trailingOverlap(current, overlap)];
  };

  for (const unit of units) {
    const currentTokens = current.reduce((s, u) => s + u.tokens, 0);
    if (current.length > 0 && currentTokens + unit.tokens > maxTokens) {
      flush();
    }
    current.push(unit);
  }
  flush();

  return chunks;
}

function trailingOverlap(units: Unit[], overlap: number): Unit[] {
  if (overlap <= 0) return [];
  const carry: Unit[] = [];
  let total = 0;
  for (let i = units.length - 1; i >= 0; i--) {
    const u = units[i]!;
    if (total + u.tokens > overlap) break;
    carry.unshift(u);
    total += u.tokens;
  }
  // Never carry the entire chunk forward (would prevent progress).
  return carry.length === units.length ? carry.slice(1) : carry;
}

function makeChunk(units: Unit[], count: (text: string) => number): Chunk {
  const text = units.map((u) => u.text).join("\n\n");
  const pages = [...new Set(units.map((u) => u.page))].sort((a, b) => a - b);
  return {
    text,
    tokens: count(text),
    pages,
    path: [...units[units.length - 1]!.path],
    bbox: unionBBox(units.map((u) => u.block.bbox)),
  };
}
