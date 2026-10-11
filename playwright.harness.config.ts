import { defineConfig } from "@playwright/test";
import regression from "./playwright.config";

// Exercise the real isolated runner with opt-in probes. Ordinary regression
// continues to exclude these intentional failures and interruptions.
export default defineConfig(regression, {
  testMatch: ["**/shell.spec.ts", "**/cleanup-isolation.spec.ts", "**/diagnostics.spec.ts"],
  testIgnore: []
});
