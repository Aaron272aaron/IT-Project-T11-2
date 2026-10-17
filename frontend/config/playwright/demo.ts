import { defineConfig } from "@playwright/test";
import sample from "./sample";
export default defineConfig({
  ...sample,
  testMatch: "demo-offline.spec.ts",
  use: { ...sample.use, baseURL: "http://127.0.0.1:5293" },
  webServer: {
    cwd: new URL("../../", import.meta.url).pathname,
    command: "npm run dev:demo -- --port 5293 --strictPort",
    url: "http://127.0.0.1:5293",
    reuseExistingServer: false,
    env: {
      API_PROXY_TARGET: "http://127.0.0.1:1",
      VITE_LOAD_SAMPLE_EXAM: "true",
    },
  },
});
