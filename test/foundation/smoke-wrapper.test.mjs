import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "invite-wrapper-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "scripts"));
  await mkdir(path.join(root, ".devstack"));
  for (const [source, name] of [
    ["scripts/Run-SmokeTests.ps1", "Run-SmokeTests.ps1"],
    ["test/support/smoke-start-stub.ps1", "Start-DevStack.ps1"],
    ["test/support/smoke-stop-stub.ps1", "Stop-DevStack.ps1"]
  ]) await copyFile(source, path.join(root, "scripts", name));
  return { root, invoke(fault = "") {
    return spawnSync("pwsh", ["-NoProfile", "-File", path.resolve("test/support/smoke-wrapper-harness.ps1"), "-Wrapper", path.join(root, "scripts/Run-SmokeTests.ps1")], {
      encoding: "utf8", timeout: 20_000, env: { ...process.env, WRAPPER_FAULT: fault }
    });
  } };
}

test("executable smoke wrapper repeats with unique IDs and records successful and failed owned teardown", async (t) => {
  const { root, invoke } = await fixture(t);
  const runs = [];
  for (const [fault, expectedExit, stage] of [["", 0, "smoke"], ["", 0, "smoke"], ["browser", 7, "smoke"], ["startup", 1, "startup"], ["diagnostic", 0, "smoke"]]) {
    const result = invoke(fault);
    assert.equal(result.status, expectedExit, result.stderr);
    const directories = await readdir(path.join(root, ".devstack/smoke-runs"));
    const id = directories.find((candidate) => !runs.includes(candidate));
    assert.ok(id, "A fresh run ID is required for every invocation");
    runs.push(id);
    const directory = path.join(root, ".devstack/smoke-runs", id);
    const summary = JSON.parse(await readFile(path.join(directory, "summary.json"), "utf8"));
    const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
    assert.equal(summary.runId, manifest.runId);
    assert.equal(summary.stage, stage);
    assert.equal(summary.exitCode, expectedExit);
    assert.equal(summary.testExitCode, fault === "startup" ? null : expectedExit);
    assert.equal(summary.recordedStackStopped, true);
    assert.equal(summary.cleanupFailure, null);
    assert.ok(manifest.tables.every(({ cleanup }) => cleanup === "deleted"));
    assert.match(await readFile(path.join(directory, "shutdown.log"), "utf8"), /scoped shutdown/);
    if (fault === "startup") assert.match(summary.failure, /injected startup failure/);
    if (fault === "browser") assert.match(summary.failure, /exit 7/);
    if (fault === "diagnostic") assert.match(summary.diagnosticFailures[0], /service-logs/);
  }
});

test("wrapper preserves the browser failure when teardown fails and records recovery diagnostics", async (t) => {
  const { root, invoke } = await fixture(t);
  const result = invoke("cleanup");
  assert.equal(result.status, 7, result.stderr);
  const [id] = await readdir(path.join(root, ".devstack/smoke-runs"));
  const summary = JSON.parse(await readFile(path.join(root, ".devstack/smoke-runs", id, "summary.json"), "utf8"));
  assert.equal(summary.testExitCode, 7);
  assert.equal(summary.exitCode, 7);
  assert.match(summary.failure, /exit 7/);
  assert.match(summary.cleanupFailure, /injected teardown failure/);
  assert.equal(summary.recordedStackStopped, false);
});

test("wrapper refuses a pre-existing shared stack without changing state or creating a run", async (t) => {
  const { root, invoke } = await fixture(t);
  const file = path.join(root, ".devstack/processes.json");
  const state = '{"shared":"preserve exactly"}\n';
  await writeFile(file, state);
  const result = invoke();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /recorded dev stack already exists/);
  assert.equal(await readFile(file, "utf8"), state);
  assert.deepEqual(await readdir(path.join(root, ".devstack")), ["processes.json"]);
});

test("wrapper refuses to stop a foreign stack recorded during its run", async (t) => {
  const { root, invoke } = await fixture(t);
  const result = invoke("foreign");
  assert.equal(result.status, 1, result.stderr);
  const state = JSON.parse(await readFile(path.join(root, ".devstack/processes.json"), "utf8"));
  assert.equal(state.smokeRunManifestPath, "someone-elses-manifest");
  const [id] = await readdir(path.join(root, ".devstack/smoke-runs"));
  const summary = JSON.parse(await readFile(path.join(root, ".devstack/smoke-runs", id, "summary.json"), "utf8"));
  assert.match(summary.cleanupFailure, /not owned by this smoke run/);
  assert.equal(summary.recordedStackStopped, false);
});
