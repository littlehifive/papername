import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["apps/*/src/**/*.ts", "packages/*/src/**/*.ts"],
      reporter: ["text", "html"],
    },
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
  },
});
