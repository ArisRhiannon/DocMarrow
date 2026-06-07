import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@docmarrow/core": r("./packages/core/src/index.ts"),
      "@docmarrow/pdf": r("./packages/pdf/src/index.ts"),
      "@docmarrow/docx": r("./packages/docx/src/index.ts"),
      "@docmarrow/ooxml": r("./packages/ooxml/src/index.ts"),
      "@docmarrow/xlsx": r("./packages/xlsx/src/index.ts"),
      "@docmarrow/pptx": r("./packages/pptx/src/index.ts"),
      "@docmarrow/html": r("./packages/html/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
  },
});
