import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  target: "es2022",
  external: ["docparse", "@docparse/core", "@docparse/pdf", "pdfjs-dist"],
  banner: { js: "#!/usr/bin/env node" },
});
