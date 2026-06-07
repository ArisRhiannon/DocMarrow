// Parse a DOCX (Word) document — same API, format autodetected from the bytes.
//
//   pnpm --filter @docmarrow/examples docx
//
// Replace makeSampleDocx() with `await readFile("your.docx")` to parse a real file.
import { parseDocument } from "docmarrow";
import { makeSampleDocx } from "./_samples.mjs";

const doc = await parseDocument(makeSampleDocx());

console.log("=== meta ===");
console.log(doc.meta); // { format: "docx", ... }

console.log("\n=== markdown ===");
console.log(doc.markdown);
