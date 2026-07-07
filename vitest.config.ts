import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests live next to the core modules; e2e is Playwright's domain.
    include: ["src/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
