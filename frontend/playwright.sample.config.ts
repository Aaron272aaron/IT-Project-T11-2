import { defineConfig } from "@playwright/test";
// Exercise the real default sample using independent ports and browser storage.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "sample-exam.spec.ts",
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5275",
    channel: "chrome",
    viewport: { width: 1440, height: 960 },
  },
  webServer: [
    {
      command: "python3 ../backend/server.py --port 8102",
      url: "http://127.0.0.1:8102/api/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 5275 --strictPort",
      url: "http://127.0.0.1:5275",
      env: { API_PROXY_TARGET: "http://127.0.0.1:8102" },
      reuseExistingServer: false,
    },
  ],
});
