import { defineConfig } from "@playwright/test";
import path from "node:path";
import { assertEffectiveEnvironment, e2eEnvironment, newRunId, resolveE2EConfiguration } from "./backend/src/adapters/local/e2e-config";

const worker = process.env.TEST_WORKER_INDEX !== undefined;
if (!worker && (process.env.E2E_RUN_ID || process.env.E2E_RUN_MANIFEST_PATH) && process.env.E2E_COORDINATOR_PID !== String(process.pid)) {
  throw new Error("Direct Playwright refuses a stale isolated run context; unset E2E_RUN_ID/E2E_RUN_MANIFEST_PATH for a fresh run");
}
const config = resolveE2EConfiguration(process.env, worker ? process.env.E2E_RUN_ID : newRunId());
if (config.mode === "isolated") {
  config.manifestPath = path.resolve(".devstack/e2e-runs", config.runId!, "manifest.json");
  if (!worker) process.env.E2E_COORDINATOR_PID = String(process.pid);
}
if (worker) assertEffectiveEnvironment(config, process.env);
else Object.assign(process.env, e2eEnvironment(config, process.env));
const evidenceDirectory = config.mode === "isolated" ? path.dirname(config.manifestPath!) : null;
const requestedWorkers = process.env.E2E_WORKERS ?? "1";
if (!/^\d+$/.test(requestedWorkers) || Number(requestedWorkers) < 1 || Number(requestedWorkers) > 4) {
  throw new Error("E2E_WORKERS must be an integer between 1 and 4");
}
const e2eWorkers = Number(requestedWorkers);
const suiteBudgetMs = Number(process.env.E2E_SUITE_BUDGET_MS ?? 6 * 60 * 1000);
if (!Number.isSafeInteger(suiteBudgetMs) || suiteBudgetMs < 60_000) {
  throw new Error("E2E_SUITE_BUDGET_MS must be at least 60000 milliseconds");
}

export default defineConfig({
  testDir: "./test/e2e",
  grepInvert: /@exhaustive/,
  testIgnore: ["**/cleanup-isolation.spec.ts", "**/diagnostics.spec.ts", "**/smoke.spec.ts"],
  globalTimeout: suiteBudgetMs,
  globalSetup: "./test/e2e/global-setup.ts",
  metadata: { e2e: config, suiteBudgetMs, e2eWorkers },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: e2eWorkers,
  outputDir: evidenceDirectory ? path.join(evidenceDirectory, "test-results") : "test-results",
  reporter: [["line"], ["html", { outputFolder: evidenceDirectory ? path.join(evidenceDirectory, "playwright-report") : "playwright-report", open: "never" }], ["./test/e2e/run-reporter.ts"]],
  use: {
    baseURL: config.webOrigin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }]
});
