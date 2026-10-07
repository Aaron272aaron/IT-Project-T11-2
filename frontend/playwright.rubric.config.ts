import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
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
      command: "python3 ../backend/server.py --port 8103",
      url: "http://127.0.0.1:8103/api/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 5276 --strictPort",
      url: "http://127.0.0.1:5276",
      reuseExistingServer: false,
      env: {
        API_PROXY_TARGET: "http://127.0.0.1:8103",
        VITE_LOAD_SAMPLE_EXAM: "true",
      },
    },
  ],
});
