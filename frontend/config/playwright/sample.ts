import { fileURLToPath } from "node:url";
const frontendDir = fileURLToPath(new URL("../../", import.meta.url));
import { defineConfig } from "@playwright/test";
// Exercise the bundled sample without starting Python, using isolated browser storage.
export default defineConfig({
  outputDir: fileURLToPath(new URL("../../test-results", import.meta.url)),
  testDir: fileURLToPath(new URL("../../e2e", import.meta.url)),
  testMatch: [
    "sample-exam.spec.ts",
    "question-types.spec.ts",
    "avatar.spec.ts",
    "code-review.spec.ts",
  ],
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5275",
    channel: "chrome",
    viewport: { width: 1440, height: 960 },
  },
  webServer: [
    {
      cwd: frontendDir,
      command: "npm run dev:frontend -- --port 5275 --strictPort",
      url: "http://127.0.0.1:5275",
      // Any accidental API dependency must fail even if a local backend is running.
      env: {
        API_PROXY_TARGET: "http://127.0.0.1:1",
        VITE_LOAD_SAMPLE_EXAM: "true",
      },
      reuseExistingServer: false,
    },
  ],
});
