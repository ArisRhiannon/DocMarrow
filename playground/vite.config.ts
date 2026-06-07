import { defineConfig } from "vite";

export default defineConfig({
  // pdfjs-dist must resolve to a single copy so the worker configured in main.ts
  // is the one the bundled docparse backend uses.
  resolve: { dedupe: ["pdfjs-dist"] },
  optimizeDeps: { include: ["pdfjs-dist/legacy/build/pdf.mjs"] },
  build: { target: "esnext" },
});
