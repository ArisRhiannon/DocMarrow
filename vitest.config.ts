import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@docparse/core": r("./packages/core/src/index.ts"),
      "@docparse/pdf": r("./packages/pdf/src/index.ts"),
      "@docparse/docx": r("./packages/docx/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
  },
});
