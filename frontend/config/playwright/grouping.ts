import { fileURLToPath } from "node:url";
const frontendDir = fileURLToPath(new URL("../../", import.meta.url));
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: fileURLToPath(new URL("../../e2e", import.meta.url)),
  testMatch: "answer-grouping.spec.ts",
  outputDir: fileURLToPath(
    new URL("../../grouping-test-results", import.meta.url),
  ),
  workers: 1,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5277",
    channel: "chrome",
    viewport: { width: 1440, height: 1100 },
  },
  webServer: {
    cwd: frontendDir,
    command: "npm run dev -- --port 5277 --strictPort",
    url: "http://127.0.0.1:5277",
    reuseExistingServer: false,
    env: {
      BACKEND_PORT: "8127",
      ALLOW_DEMO_API: "1",
      AUTH_DB_PATH: ":temporary:",
      AI_REPAIR_ENABLED: "0",
      DOCKER_AUTOSTART: "0",
      VITE_LOAD_SAMPLE_EXAM: "false",
    },
  },
});
