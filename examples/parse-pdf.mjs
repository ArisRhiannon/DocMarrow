// Parse a PDF into Markdown + structured JSON + metadata.
//
//   pnpm --filter @docparse/examples pdf
//
// Replace makeSamplePdf() with `await readFile("your.pdf")` to parse a real file.
import { parseDocument } from "docparse-ts";
import { makeSamplePdf } from "./_samples.mjs";

const bytes = await makeSamplePdf();
const doc = await parseDocument(bytes);

console.log("=== meta ===");
console.log(doc.meta);

console.log("\n=== markdown ===");
console.log(doc.markdown);

console.log("=== first JSON node ===");
console.log(doc.json[0]);
