import { fileURLToPath } from "node:url";
const frontendDir = fileURLToPath(new URL("../../", import.meta.url));
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: fileURLToPath(new URL("../../e2e", import.meta.url)),
  testMatch: "auth.spec.ts",
  outputDir: fileURLToPath(new URL("../../auth-test-results", import.meta.url)),
  workers: 1,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5278",
    channel: "chrome",
    viewport: { width: 1440, height: 1100 },
  },
  webServer: {
    cwd: frontendDir,
    command: "npm run dev -- --port 5278 --strictPort",
    url: "http://127.0.0.1:5278",
    reuseExistingServer: false,
    env: {
      BACKEND_PORT: "8128",
      AI_REPAIR_ENABLED: "0",
      DOCKER_AUTOSTART: "0",
      AUTH_DB_PATH: ":temporary:",
      ALLOW_DEMO_API: "0",
      VITE_LOAD_SAMPLE_EXAM: "false",
    },
  },
});
