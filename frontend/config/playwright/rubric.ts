import { fileURLToPath } from "node:url";
const frontendDir = fileURLToPath(new URL("../../", import.meta.url));
import { defineConfig } from "@playwright/test";
export default defineConfig({
  outputDir: fileURLToPath(new URL("../../test-results", import.meta.url)),
  testDir: fileURLToPath(new URL("../../e2e", import.meta.url)),
  testMatch: "rubric-editor.spec.ts",
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5276",
    channel: "chrome",
    viewport: { width: 1440, height: 960 },
  },
  webServer: [
    {
      cwd: frontendDir,
      command: "python3 ../backend/api/server.py --port 8103",
      url: "http://127.0.0.1:8103/api/health",
      reuseExistingServer: false,
      env: {
        ALLOW_DEMO_API: "1",
        AUTH_DB_PATH: ":temporary:",
        AI_REPAIR_ENABLED: "0",
        DOCKER_AUTOSTART: "0",
      },
    },
    {
      cwd: frontendDir,
      command: "npm run dev:frontend -- --port 5276 --strictPort",
      url: "http://127.0.0.1:5276",
      reuseExistingServer: false,
      env: {
        API_PROXY_TARGET: "http://127.0.0.1:8103",
        VITE_LOAD_SAMPLE_EXAM: "true",
      },
    },
  ],
});
