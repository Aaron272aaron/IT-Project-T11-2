import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testIgnore: [
    "**/sample-exam.spec.ts",
    "**/rubric-editor.spec.ts",
    "**/question-types.spec.ts",
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
      command: "python3 ../backend/server.py --port 8001",
      url: "http://127.0.0.1:8001/api/health",
      reuseExistingServer: false,
    },
    {
      // Fail if the expected port is occupied instead of silently switching.
      command: "npm run dev -- --port 5174 --strictPort",
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
