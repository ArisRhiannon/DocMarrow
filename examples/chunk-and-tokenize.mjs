// Structure-aware RAG chunking, including a custom token counter.
//
//   pnpm --filter @docmarrow/examples chunks
//
// By default `chunks()` uses a dependency-free word heuristic. Pass `countTokens`
// to plug in a real model tokenizer (e.g. js-tiktoken's `enc.encode(t).length`).
import { parseDocument } from "docmarrow";
import { makeSamplePdf } from "./_samples.mjs";

const doc = await parseDocument(await makeSamplePdf());

const chunks = doc.chunks({ maxTokens: 64, overlap: 8 });
console.log(`Produced ${chunks.length} chunk(s) with the default heuristic tokenizer:\n`);
for (const [i, c] of chunks.entries()) {
  console.log(`--- chunk ${i + 1} | ~${c.tokens} tokens | pages ${c.pages.join(",")} | path: ${c.path.join(" > ") || "(root)"}`);
  console.log(c.text, "\n");
}

// Example: a character-based counter (stand-in for a real BPE tokenizer).
const withCustom = doc.chunks({ maxTokens: 200, countTokens: (t) => t.length });
console.log(`With a custom countTokens, chunk 1 reports ${withCustom[0].tokens} "tokens" (characters).`);
