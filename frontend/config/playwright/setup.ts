import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: fileURLToPath(new URL("../../e2e", import.meta.url)),
  testMatch: "model-download.spec.ts",
  outputDir: fileURLToPath(
    new URL("../../setup-test-results", import.meta.url),
  ),
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5285",
    channel: "chrome",
    viewport: { width: 1440, height: 1100 },
  },
  webServer: {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    command: "npm run dev -- --port 5285 --strictPort",
    url: "http://127.0.0.1:5285",
    reuseExistingServer: false,
    env: {
      BACKEND_PORT: "8145",
      AI_REPAIR_ENABLED: "0",
      DOCKER_AUTOSTART: "0",
      AUTH_DB_PATH: ":temporary:",
      ALLOW_DEMO_API: "1",
      VITE_LOAD_SAMPLE_EXAM: "false",
    },
  },
});
