import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 20_000,
  expect: { timeout: 5_000 },
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  outputDir: "test-results",
  use: {
    baseURL: process.env.ALPS_E2E_URL || "http://127.0.0.1:3000",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 900 },
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "off",
    launchOptions: process.env.ALPS_BROWSER_EXECUTABLE
      ? { executablePath: process.env.ALPS_BROWSER_EXECUTABLE }
      : undefined,
  },
});
