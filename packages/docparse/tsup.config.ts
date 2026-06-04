import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm", "cjs"],
  dts: { entry: "src/index.ts", resolve: ["@docparse/core", "@docparse/pdf"] },
  clean: true,
  sourcemap: true,
  target: "es2022",
  // Bundle the workspace packages into this single publishable package.
  noExternal: ["@docparse/core", "@docparse/pdf"],
  external: ["pdfjs-dist"],
});
