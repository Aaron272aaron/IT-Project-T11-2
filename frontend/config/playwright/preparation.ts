import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: fileURLToPath(new URL("../../e2e", import.meta.url)),
  testMatch: "ai-preparation.spec.ts",
  outputDir: fileURLToPath(
    new URL("../../preparation-test-results", import.meta.url),
  ),
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5286",
    channel: "chrome",
    viewport: { width: 1440, height: 960 },
  },
  webServer: {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    command: "npm run dev:frontend -- --port 5286 --strictPort",
    url: "http://127.0.0.1:5286",
    env: {
      API_PROXY_TARGET: "http://127.0.0.1:1",
      VITE_LOAD_SAMPLE_EXAM: "true",
    },
    reuseExistingServer: false,
  },
});
