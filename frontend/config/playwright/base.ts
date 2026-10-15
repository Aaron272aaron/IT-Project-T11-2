import { fileURLToPath } from "node:url";
const frontendDir = fileURLToPath(new URL("../../", import.meta.url));
import { defineConfig } from "@playwright/test";
export default defineConfig({
  outputDir: fileURLToPath(new URL("../../test-results", import.meta.url)),
  testDir: fileURLToPath(new URL("../../e2e", import.meta.url)),
  testIgnore: [
    "**/runner.spec.ts",
    "**/model-download.spec.ts",
    "**/sample-test-cases.spec.ts",
    "**/sample-exam.spec.ts",
    "**/rubric-editor.spec.ts",
    "**/question-types.spec.ts",
    "**/avatar.spec.ts",
    "**/answer-grouping.spec.ts",
    "**/auth.spec.ts",
    "**/code-review.spec.ts",
    "**/ai-preparation.spec.ts",
  ],
  use: {
    // Tests use their own Vite port instead of your manual development tab.
    baseURL: "http://127.0.0.1:5174",
    channel: "chrome",
    viewport: { width: 1440, height: 960 },
  },
  workers: 1,
  reporter: "list",
  // Playwright starts both services, waits for their URLs to respond, and
  // stops the processes it started after the browser tests finish.
  webServer: [
    {
      // Run the same Python code on a separate port for real HTTP tests.
      cwd: frontendDir,
      command: "python3 ../backend/api/server.py --port 8001",
      url: "http://127.0.0.1:8001/api/health",
      reuseExistingServer: false,
      env: {
        AUTH_DB_PATH: ":temporary:",
        AI_REPAIR_ENABLED: "0",
        DOCKER_AUTOSTART: "0",
      },
    },
    {
      // Fail if the expected port is occupied instead of silently switching.
      cwd: frontendDir,
      command: "npm run dev:frontend -- --port 5174 --strictPort",
      url: "http://127.0.0.1:5174",
      // Point this Vite instance at the test Python process above.
      env: {
        API_PROXY_TARGET: "http://127.0.0.1:8001",
        VITE_LOAD_SAMPLE_EXAM: "false",
      },
      reuseExistingServer: false,
    },
  ],
});
