import { defineConfig } from "@playwright/test";
import regression from "./playwright.config";

// Inherit the same isolated runner, evidence and cleanup as ordinary regression.
export default defineConfig(regression, {
  grep: /@exhaustive/,
  grepInvert: undefined
});
