import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm", "cjs"],
  dts: {
    entry: "src/index.ts",
    resolve: [
      "@docmarrow/core",
      "@docmarrow/pdf",
      "@docmarrow/docx",
      "@docmarrow/ooxml",
      "@docmarrow/xlsx",
      "@docmarrow/pptx",
      "@docmarrow/html",
    ],
  },
  clean: true,
  sourcemap: true,
  target: "es2022",
  // Bundle the workspace packages into this single publishable package.
  noExternal: [
    "@docmarrow/core",
    "@docmarrow/pdf",
    "@docmarrow/docx",
    "@docmarrow/ooxml",
    "@docmarrow/xlsx",
    "@docmarrow/pptx",
    "@docmarrow/html",
  ],
  external: ["pdfjs-dist", "fflate", "fast-xml-parser", "node-html-parser"],
});
