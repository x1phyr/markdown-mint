import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["**/*.d.ts", "**/dist/**", "apps/renderer/src/server.ts", "apps/web/**"],
      include: ["apps/renderer/src/**/*.ts", "packages/*/src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
  },
});
