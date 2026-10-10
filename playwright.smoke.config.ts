import { defineConfig } from "@playwright/test";
import regression from "./playwright.config";

// Smoke is an explicit managed tier, so opt back into the file excluded from
// the ordinary fast regression configuration while retaining its runner.
export default defineConfig(regression, {
  testIgnore: undefined,
  grep: undefined,
  grepInvert: undefined,
  globalTimeout: 6 * 60 * 1000,
  metadata: { ...regression.metadata, suiteBudgetMs: 6 * 60 * 1000 }
});
