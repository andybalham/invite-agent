import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { provisionE2ETables, readE2EManifest } from "../../backend/dist/adapters/local/e2e-resources.js";
import { finishE2ERun, previewE2ERecovery, recoverE2ERun } from "../../scripts/e2e-run-cleanup.mjs";
import { fixture } from "../support/e2e-resource-fixture.mjs";
import { evidenceSnapshot } from "../support/e2e-verification.mjs";

async function populated(t) {
  const run = await fixture(t);
  await provisionE2ETables(run.file, run.client);
  const unrelated = await fixture(t);
  await provisionE2ETables(unrelated.file, unrelated.client);
  for (const [name, table] of unrelated.client.tables) run.client.tables.set(name, table);
  for (const name of ["invite-agent-local-app", "invite-agent-local-audit", "caller-app", "caller-audit"]) {
    run.client.tables.set(name, { records: ["poll", "participant", "capability", "name lock", "dashboard index", "audit"] });
  }
  for (const { name } of run.manifest.tables) run.client.tables.get(name).records = ["untracked poll", "untracked capability", "untracked event"];
  run.protectedState = structuredClone([...run.client.tables].filter(([name]) => !run.manifest.tables.some((table) => table.name === name)));
  run.options = { client: run.client, observe: async () => null };
  return run;
}

test("connectivity failure never means absence; repeated recovery preserves original evidence and unrelated run records", async (t) => {
  const { file, manifest, client, options, protectedState } = await populated(t);
  const directory = path.dirname(file);
  await mkdir(path.join(directory, "test-results"));
  for (const artifact of ["test-results/trace.zip", "test-results/failure.png", "test-results/video.webm", "startup.log", "playwright.log"]) {
    await writeFile(path.join(directory, artifact), Buffer.from([0, 1, 2, 255]));
  }
  client.beforeSend = () => { throw Object.assign(new Error("connection refused"), { name: "NetworkingError" }); };
  const failed = await finishE2ERun(file, { ...options, failure: "primary browser timeout" });
  assert.equal(failed.finalExitCode, 1);
  assert.deepEqual(failed.remainingTables, manifest.tables.map(({ name }) => name));
  assert.ok(failed.tables.every(({ observation, error }) => observation === "unknown" && /NetworkingError/.test(error)));
  const evidence = await evidenceSnapshot(directory);
  const originalAttempt = structuredClone((await readE2EManifest(file)).cleanupAttempts[0]);
  const previewStart = client.calls.length;
  const preview = await previewE2ERecovery(file, options);
  assert.deepEqual(preview.eligibleDeletionSet, []);
  assert.ok(preview.tables.every(({ state }) => state === "refused"));
  assert.ok(client.calls.slice(previewStart).every(({ type }) => type === "DescribeTableCommand"));
  const stillFailed = await recoverE2ERun(file, manifest.runId, options);
  assert.equal(stillFailed.recoveryRequired, true);
  assert.equal(client.calls.some(({ type }) => type === "DeleteTableCommand"), false);
  client.beforeSend = null;
  const recovered = await recoverE2ERun(file, manifest.runId, options);
  assert.equal(recovered.recoveryRequired, false);
  assert.deepEqual([...client.tables], protectedState);
  assert.deepEqual(await evidenceSnapshot(directory), evidence);
  assert.deepEqual((await readE2EManifest(file)).cleanupAttempts[0], originalAttempt);
  const deletes = client.calls.filter(({ type }) => type === "DeleteTableCommand").length;
  await recoverE2ERun(file, manifest.runId, options);
  assert.equal(client.calls.filter(({ type }) => type === "DeleteTableCommand").length, deletes);
  assert.deepEqual(await evidenceSnapshot(directory), evidence);
});

test("ownership drift between inspection and delete preserves changed table while cleaning its peer", async (t) => {
  const { file, manifest, client, options, protectedState } = await populated(t);
  const app = manifest.tables[0].name;
  let reads = 0;
  let intent;
  client.beforeSend = async (command) => {
    if (command.constructor.name === "GetItemCommand" && command.input.TableName === app && ++reads === 2) {
      intent = await readE2EManifest(file);
      client.tables.get(app).marker.nonce.S = "another-owner-after-intent";
    }
  };
  const result = await finishE2ERun(file, options);
  assert.ok(intent.tables[0].deletionAttempted && intent.tables[0].deletionRequestedAt);
  assert.equal(result.recoveryRequired, true);
  assert.deepEqual(result.remainingTables, [app]);
  assert.equal(client.tables.has(manifest.tables[1].name), false);
  assert.equal(client.calls.some(({ type, TableName }) => type === "DeleteTableCommand" && TableName === app), false);
  assert.equal(client.tables.get(app).marker.nonce.S, "another-owner-after-intent");
  assert.deepEqual([...client.tables].filter(([name]) => name !== app), protectedState);
});

test("simultaneous selected-run recovery has one lock holder and one append-only attempt", async (t) => {
  const { file, manifest, client, options, protectedState } = await populated(t);
  let signalEntered;
  let release;
  const entered = new Promise((resolve) => { signalEntered = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const first = recoverE2ERun(file, manifest.runId, { ...options, stopWriters: async () => { signalEntered(); await gate; return []; } });
  try {
    await entered;
    const lock = JSON.parse(await readFile(path.join(path.dirname(file), "recovery.lock"), "utf8"));
    assert.equal(lock.runId, manifest.runId);
    await assert.rejects(recoverE2ERun(file, manifest.runId, options), /EEXIST/);
    assert.equal(client.calls.some(({ type }) => type === "DeleteTableCommand"), false);
    assert.equal((await readE2EManifest(file)).cleanupAttempts.length, 1);
  } finally { release(); await first; }
  assert.deepEqual([...client.tables], protectedState);
  assert.equal((await readE2EManifest(file)).cleanupAttempts.length, 1);
  await assert.rejects(readFile(path.join(path.dirname(file), "recovery.lock")), { code: "ENOENT" });
});
