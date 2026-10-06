import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { cleanupE2ETables } from "../../backend/dist/adapters/local/e2e-cleanup.js";
import { provisionE2ETables, readE2EManifest, saveE2EManifest } from "../../backend/dist/adapters/local/e2e-resources.js";
import { finishE2ERun, previewE2ERecovery, recoverE2ERun, stopOwnedWriters } from "../../scripts/e2e-run-cleanup.mjs";
import { fixture } from "../support/e2e-resource-fixture.mjs";

async function prepared(t) {
  const f = await fixture(t);
  await provisionE2ETables(f.file, f.client);
  f.manifest = await readE2EManifest(f.file);
  f.options = { client: f.client, observe: async () => null };
  return f;
}

test("pass, primary failure, timeout and catchable interruption all remove only the run pair and retain evidence", async (t) => {
  for (const outcome of [{}, { failure: "assertion failed" }, { failure: "browser timeout" }, { interruption: "SIGINT" }]) {
    const { file, client, manifest, options } = await prepared(t);
    const other = await prepared(t);
    for (const [name, value] of other.client.tables) client.tables.set(name, value);
    for (const name of ["invite-agent-local-app", "invite-agent-local-audit", "custom-persistent-app", "custom-persistent-audit"]) client.tables.set(name, { records: ["keep exactly"] });
    const protectedState = structuredClone([...client.tables].filter(([name]) => !manifest.tables.some((table) => table.name === name)));
    const directory = path.dirname(file);
    await mkdir(path.join(directory, "test-results", "worker"), { recursive: true });
    const pollId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    await writeFile(path.join(directory, "test-results", "worker", `poll-${pollId}.json`), JSON.stringify({ pollId }));
    await writeFile(path.join(directory, "test-results", "worker", "trace.zip"), "browser evidence");
    const summary = await finishE2ERun(file, { ...options, ...outcome });
    const saved = await readE2EManifest(file);
    assert.deepEqual([...client.tables], protectedState);
    assert.deepEqual(saved.pollIds, [pollId]);
    assert.ok(saved.tables.every(({ cleanup, deletionAttempted, deletionRequestedAt }) => cleanup === "deleted" && deletionAttempted && deletionRequestedAt));
    assert.equal(saved.cleanupAttempts[0].outcome, outcome.interruption ? "interrupted" : "complete");
    assert.equal(summary.failure, outcome.failure ?? null);
    assert.equal(summary.interruption, outcome.interruption ?? null);
    assert.equal(summary.testExitCode, null);
    assert.equal(summary.recoveryRequired, false);
    assert.equal(await readFile(path.join(directory, "test-results", "worker", "trace.zip"), "utf8"), "browser evidence");
    assert.ok(client.calls.filter(({ type }) => type === "DeleteTableCommand").every(({ TableName }) => manifest.tables.some(({ name }) => name === TableName)));
  }
});

test("partial delete failure retries one run, preserves primary summary and every earlier error", async (t) => {
  const { file, client, manifest, options } = await prepared(t);
  client.beforeSend = (command) => { if (command.constructor.name === "DeleteTableCommand" && command.input.TableName === manifest.tables[0].name) throw new Error("unreachable delete"); };
  const failed = await finishE2ERun(file, { ...options, failure: "original browser failure" });
  assert.equal(failed.recoveryRequired, true);
  const saved = await readE2EManifest(file);
  assert.equal(saved.tables[0].cleanup, "failed");
  assert.equal(saved.tables[1].cleanup, "deleted");
  assert.match(saved.tables[0].cleanupError, /unreachable delete/);
  const original = await readFile(path.join(path.dirname(file), "summary.json"), "utf8");
  client.beforeSend = null;
  const preview = await previewE2ERecovery(file, options);
  assert.deepEqual(preview.eligibleDeletionSet, [manifest.tables[0].name]);
  await assert.rejects(recoverE2ERun(file, "other-run", options), /confirmation/);
  const recovered = await recoverE2ERun(file, manifest.runId, options);
  assert.equal(recovered.recoveryRequired, false);
  assert.equal(recovered.finalExitCode, 0);
  assert.equal(await readFile(path.join(path.dirname(file), "summary.json"), "utf8"), original);
  const final = await readE2EManifest(file);
  assert.equal(final.cleanupAttempts.length, 2);
  assert.equal(final.cleanupAttempts[0].outcome, "failed");
  assert.match(final.cleanupAttempts[0].tables[0].error, /unreachable delete/);
  assert.equal(final.cleanupAttempts[1].origin, "recovery");
  assert.ok(final.tables.every(({ cleanupError }) => cleanupError === null));
  assert.equal(JSON.parse(await readFile(path.join(path.dirname(file), "recovery", recovered.attemptId, "summary.json"), "utf8")).recoveryRequired, false);
  const deletes = client.calls.filter(({ type }) => type === "DeleteTableCommand").length;
  await recoverE2ERun(file, manifest.runId, options);
  assert.equal(client.calls.filter(({ type }) => type === "DeleteTableCommand").length, deletes);
  assert.equal((await readE2EManifest(file)).cleanupAttempts.length, 3);
});

test("live marker, role, schema and creation identity mismatches preserve refused table and clean its peer", async (t) => {
  for (const change of [
    (table) => { table.marker.nonce.S = "foreign"; }, (table) => { table.marker.role.S = "audit"; },
    (table) => { delete table.marker; }, (table) => { table.schema.CreationDateTime = new Date("2026-10-07"); },
    (table) => { table.schema.GlobalSecondaryIndexes[0].Projection.ProjectionType = "KEYS_ONLY"; }
  ]) {
    const { file, client, manifest, options } = await prepared(t);
    change(client.tables.get(manifest.tables[0].name));
    const before = structuredClone(client.tables.get(manifest.tables[0].name));
    const summary = await finishE2ERun(file, options);
    assert.equal(summary.recoveryRequired, true);
    assert.deepEqual(client.tables.get(manifest.tables[0].name), before);
    assert.equal(client.tables.has(manifest.tables[1].name), false);
    assert.ok(!client.calls.some(({ type, TableName }) => type === "DeleteTableCommand" && TableName === manifest.tables[0].name));
  }
});

test("completed names are rechecked and replacements refused even with a copied matching marker", async (t) => {
  const { file, client, manifest, options } = await prepared(t);
  const original = structuredClone([...client.tables]);
  await finishE2ERun(file, options);
  client.tables.set(...original[0]);
  const deletes = client.calls.filter(({ type }) => type === "DeleteTableCommand").length;
  assert.equal((await previewE2ERecovery(file, options)).tables[0].state, "refused");
  const result = await recoverE2ERun(file, manifest.runId, options);
  assert.equal(result.recoveryRequired, true);
  assert.equal((await readE2EManifest(file)).tables[0].cleanup, "deleted", "Never reset a completed entry to consume a replacement");
  assert.match((await readE2EManifest(file)).tables[0].cleanupError, /Replacement/);
  assert.equal(client.calls.filter(({ type }) => type === "DeleteTableCommand").length, deletes);
});

test("lost marker acknowledgement recovers by live nonce; an unmarked partial creation is retained", async (t) => {
  for (const markerSaved of [false, true]) {
    const { file, client, manifest } = await fixture(t);
    client.beforeSend = (command) => {
      if (command.constructor.name === "PutItemCommand") {
        if (markerSaved) client.tables.get(command.input.TableName).marker = command.input.Item;
        throw new Error("marker acknowledgement lost");
      }
    };
    await assert.rejects(provisionE2ETables(file, client), /acknowledgement/);
    assert.equal((await readE2EManifest(file)).tables[0].creationIdentity, null);
    client.beforeSend = null;
    const summary = await finishE2ERun(file, { client, observe: async () => null });
    assert.equal(summary.recoveryRequired, !markerSaved);
    assert.equal(client.tables.has(manifest.tables[0].name), !markerSaved);
    assert.equal((await readE2EManifest(file)).tables[1].cleanup, "pending", "Never-created table remains pending after confirmed absence");
    assert.equal(summary.tables[1].observation, "absent");
  }
});

test("lost delete response and already DELETING resume through read-only absence confirmation", async (t) => {
  for (const lostResponse of [true, false]) {
    const { file, client, manifest, options } = await prepared(t);
    client.beforeSend = (command) => {
      if (command.constructor.name === "DeleteTableCommand" && command.input.TableName === manifest.tables[0].name) {
        client.tables.delete(command.input.TableName);
        if (lostResponse) throw new Error("delete response lost");
      }
    };
    if (!lostResponse) client.beforeSend = null;
    await finishE2ERun(file, options);
    const saved = await readE2EManifest(file);
    if (!lostResponse) {
      // Simulate hard interruption after persisted intent, before observed absence.
      const original = await prepared(t);
      const table = structuredClone(original.client.tables.get(original.manifest.tables[0].name));
      table.schema.TableStatus = "DELETING";
      delete table.marker;
      client.tables.set(manifest.tables[0].name, table);
      saved.tables[0].cleanup = "failed";
      await saveE2EManifest(file, saved);
    }
    client.beforeSend = (command) => {
      if (!lostResponse && command.constructor.name === "DescribeTableCommand" && command.input.TableName === manifest.tables[0].name) {
        const descriptions = client.calls.filter(({ type, TableName }) => type === "DescribeTableCommand" && TableName === manifest.tables[0].name).length;
        if (descriptions > 12) client.tables.delete(command.input.TableName);
      }
    };
    const deletes = client.calls.filter(({ type }) => type === "DeleteTableCommand").length;
    const result = await recoverE2ERun(file, manifest.runId, options);
    assert.equal(result.recoveryRequired, false);
    assert.equal(client.calls.filter(({ type }) => type === "DeleteTableCommand").length, deletes);
    assert.equal((await readE2EManifest(file)).tables[0].cleanup, "deleted");
  }
});

test("unproven DELETING and bounded deletion timeout remain failed and retryable", async (t) => {
  const { file, client, manifest } = await prepared(t);
  client.tables.get(manifest.tables[0].name).schema.TableStatus = "DELETING";
  const attempt = { attemptId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", startedAt: new Date().toISOString(), finishedAt: null, origin: "automatic", outcome: null, interruption: null, phases: { writers: [], tables: [], diagnostics: [], dynamodb: "reused" }, tables: [] };
  manifest.cleanupAttempts.push(attempt);
  client.beforeSend = (command) => {
    if (command.constructor.name === "DeleteTableCommand") {
      client.tables.get(command.input.TableName).schema.TableStatus = "DELETING";
      throw new Error("request still processing");
    }
  };
  await cleanupE2ETables(file, manifest, client, attempt, 1);
  assert.match(attempt.tables[0].error, /Unproven deletion/);
  const saved = await readE2EManifest(file);
  const resume = structuredClone(attempt); resume.tables = []; resume.phases.tables = [];
  client.beforeSend = null;
  await cleanupE2ETables(file, saved, client, resume, 1);
  assert.match(resume.tables[1].error, /Timed out/);
  assert.equal(saved.tables[1].cleanup, "failed");
});

test("writer mismatch globally defers deletion; diagnostics cannot suppress safe cleanup", async (t) => {
  const { file, client, manifest, options } = await prepared(t);
  manifest.services.processes.push({ ...manifest.coordinator, pid: 9876, role: "api" });
  await saveE2EManifest(file, manifest);
  let kills = 0;
  const bad = { ...options, observe: async (pid) => pid === 9876 ? "1" : null, kill: () => { kills++; } };
  const result = await finishE2ERun(file, { ...bad, flushLogs: async () => { throw new Error("log unavailable"); } });
  assert.equal(kills, 0);
  assert.equal(result.recoveryRequired, true);
  assert.match(result.diagnosticFailures.join(";"), /log unavailable/);
  assert.equal(client.calls.some(({ type }) => type === "DeleteTableCommand"), false);
  await assert.rejects(previewE2ERecovery(file, bad), /PID\/start-time/);
  const good = await finishE2ERun(file, { ...options, flushLogs: async () => { throw new Error("log unavailable"); } });
  assert.equal(good.recoveryRequired, false);
});

test("recovery rejects live coordinator, concurrent lock and unsafe manifest before deletes", async (t) => {
  const { file, client, manifest, options } = await prepared(t);
  await assert.rejects(previewE2ERecovery(file, { ...options, observe: async () => manifest.coordinator.startTimeUtcFileTime }), /coordinator is live/);
  const lock = path.join(path.dirname(file), "recovery.lock");
  await writeFile(lock, "other recovery");
  await assert.rejects(recoverE2ERun(file, manifest.runId, options), /EEXIST/);
  assert.equal(await readFile(lock, "utf8"), "other recovery");
  await rm(lock);
  const original = await readFile(file, "utf8");
  for (const change of [(m) => { m.schemaVersion = 1; }, (m) => { m.tables[0].name = "invite-agent-local-app"; }, (m) => { m.endpoint = "http://remote:18000"; }, (m) => { m.cleanupAttempts = [{}]; }]) {
    const invalid = structuredClone(manifest); change(invalid);
    await writeFile(file, JSON.stringify(invalid));
    await assert.rejects(recoverE2ERun(file, manifest.runId, options));
  }
  await writeFile(file, original);
  assert.equal(client.calls.some(({ type }) => type === "DeleteTableCommand"), false);
});

test("intent persistence failure blocks delete; state-save failure never fabricates success", async (t) => {
  const { file, client, manifest, options } = await prepared(t);
  let reads = 0;
  client.beforeSend = async (command) => {
    if (command.constructor.name === "GetItemCommand" && ++reads === 1) { await rm(file); await mkdir(file); }
  };
  await assert.rejects(finishE2ERun(file, options));
  assert.equal(client.calls.some(({ type }) => type === "DeleteTableCommand"), false);
  assert.equal(client.tables.size, 2);
  assert.ok(manifest.tables.every(({ name }) => client.tables.has(name)));
});

test("process termination observes start time before kill and confirmed disappearance after it", async (t) => {
  const { manifest } = await prepared(t);
  manifest.services.processes.push({ ...manifest.coordinator, pid: 9876, role: "api" });
  let live = manifest.coordinator.startTimeUtcFileTime;
  const killed = [];
  assert.deepEqual(await stopOwnedWriters(manifest, { observe: async () => live, kill: (pid) => { killed.push(pid); live = null; } }), []);
  assert.deepEqual(killed, [9876]);
});
