import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  // tsconfig keeps jsx: "preserve" for Next; tests need it compiled.
  oxc: { jsx: { runtime: "automatic" } },
});
