import { fileURLToPath } from "node:url";
const frontendDir = fileURLToPath(new URL("../../", import.meta.url));
import { defineConfig } from "@playwright/test";

// Real Docker and cached local AI; keep normal offline tests independent of both.
export default defineConfig({
  testDir: fileURLToPath(new URL("../../e2e", import.meta.url)),
  testMatch: ["runner.spec.ts", "sample-test-cases.spec.ts"],
  outputDir: fileURLToPath(
    new URL("../../runner-test-results", import.meta.url),
  ),
  timeout: 180_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5276",
    channel: "chrome",
    viewport: { width: 1440, height: 960 },
  },
  webServer: {
    timeout: 270_000,
    cwd: frontendDir,
    command: "npm run dev -- --port 5276 --strictPort",
    url: "http://127.0.0.1:5276",
    env: {
      AUTH_DB_PATH: ":temporary:",
      BACKEND_PORT: "8026",
      VITE_LOAD_SAMPLE_EXAM: "true",
    },
    reuseExistingServer: false,
  },
});
