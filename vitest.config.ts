import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@docmarrow/core": r("./packages/core/src/index.ts"),
      "@docmarrow/pdf": r("./packages/pdf/src/index.ts"),
      "@docmarrow/docx": r("./packages/docx/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
  },
});
