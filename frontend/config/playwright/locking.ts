import { defineConfig } from "@playwright/test";
import auth from "./auth";
export default defineConfig({
  ...auth, testMatch: "live-locking.spec.ts", outputDir: "locking-test-results",
  use: {...auth.use, baseURL: "http://127.0.0.1:5297"},
  webServer: {...auth.webServer as object, command: "npm run dev -- --port 5297 --strictPort", url: "http://127.0.0.1:5297", env: {BACKEND_PORT: "8147", AI_REPAIR_ENABLED: "0", DOCKER_AUTOSTART: "0", AUTH_DB_PATH: ":temporary:", ALLOW_DEMO_API: "0", VITE_LOAD_SAMPLE_EXAM: "false"}},
});
