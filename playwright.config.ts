import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    // Deck slides are 16:9; size the viewport to match for clean screenshots.
    viewport: { width: 1280, height: 720 },
  },
});
