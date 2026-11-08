import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import auth from "./auth";
export default defineConfig({
  ...auth,
  testMatch: "recovery.spec.ts",
  outputDir: fileURLToPath(
    new URL("../../recovery-test-results", import.meta.url),
  ),
  timeout: 90000,
  use: { ...auth.use, baseURL: "http://127.0.0.1:5298" },
  webServer: {
    ...(auth.webServer as object),
    command: "npm run dev -- --port 5298 --strictPort",
    url: "http://127.0.0.1:5298",
    env: {
      BACKEND_PORT: "8148",
      AI_REPAIR_ENABLED: "0",
      DOCKER_AUTOSTART: "0",
      AUTH_DB_PATH: ":temporary:",
      ALLOW_DEMO_API: "0",
      VITE_LOAD_SAMPLE_EXAM: "false",
    },
  },
});
