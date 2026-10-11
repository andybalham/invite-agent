import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

function selection(config, files = []) {
  const environment = { ...process.env, APP_ENV: "test", AUTH_MODE: "local", E2E_ALLOW_SHARED_TABLES: "0",
    DYNAMODB_ENDPOINT: "http://127.0.0.1:18000", DYNAMODB_PORT: "18000", API_PORT: "14000", WEB_PORT: "15173" };
  for (const key of ["E2E_MODE", "E2E_RUN_ID", "E2E_RUN_MANIFEST_PATH", "E2E_COORDINATOR_PID", "E2E_API_INSTANCE_ID",
    "SMOKE_RUN_MANIFEST_PATH", "PUBLIC_BASE_URL", "TEST_WORKER_INDEX", "NODE_TEST_CONTEXT"]) delete environment[key];
  const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", `--config=${config}`,
    ...files, "--list", "--reporter=json"], { env: environment, encoding: "utf8", windowsHide: true, timeout: 30_000 });
  assert.equal(result.error, undefined, `Selection did not finish: ${result.error}`);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const suites = JSON.parse(result.stdout).suites;
  return suites.flatMap((suite) => {
    const specs = (entry) => [...(entry.specs ?? []), ...(entry.suites ?? []).flatMap(specs)];
    return specs(suite).flatMap((spec) => spec.tests.map(() => path.basename(spec.file)));
  });
}

test("runner probes are discoverable only through the focused harness configuration", () => {
  const probes = ["cleanup-isolation.spec.ts", "diagnostics.spec.ts"];
  const regression = selection("playwright.config.ts");
  assert.ok(regression.length > 0);
  for (const excluded of [...probes, "smoke.spec.ts"]) assert.ok(!regression.includes(excluded), `${excluded} leaked into ordinary regression`);
  assert.deepEqual(selection("playwright.harness.config.ts").sort(), [probes[0], probes[1], probes[1], "shell.spec.ts"]);
  for (const [file, count] of [[probes[0], 1], [probes[1], 2], ["shell.spec.ts", 1]]) {
    assert.deepEqual(selection("playwright.harness.config.ts", [`test/e2e/${file}`]), Array(count).fill(file));
  }
});
