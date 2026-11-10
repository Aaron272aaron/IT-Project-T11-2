import base from "./base";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: ["backend-storage.spec.ts", "submission-locks.spec.ts"],
});
