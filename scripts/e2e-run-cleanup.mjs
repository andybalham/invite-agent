import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { e2eClient, readE2EManifest, saveE2EManifest } from "../backend/dist/adapters/local/e2e-resources.js";
import { cleanupE2ETables, inspectE2ETable } from "../backend/dist/adapters/local/e2e-cleanup.js";
import { observeProcess } from "../backend/dist/adapters/local/e2e-runtime.js";

export async function stopOwnedWriters(manifest, { observe = observeProcess, kill = (pid) => process.kill(pid, "SIGTERM") } = {}) {
  const errors = [];
  for (const identity of manifest.services.processes.toReversed()) {
    try {
      const live = await observe(identity.pid);
      if (live === null) continue;
      if (live !== identity.startTimeUtcFileTime) throw new Error(`PID/start-time mismatch for ${identity.role} ${identity.pid}; retained, investigate identity`);
      kill(identity.pid);
      const deadline = Date.now() + 5000;
      for (;;) {
        const current = await observe(identity.pid);
        if (current === null) break;
        if (current !== identity.startTimeUtcFileTime) throw new Error(`PID reused after stopping ${identity.role}; unrelated process retained`);
        if (Date.now() >= deadline) throw new Error(`${identity.role} ${identity.pid} did not stop; retry after verified writer shutdown`);
        await delay(100);
      }
    } catch (error) { errors.push(`${identity.role} ${identity.pid}: ${error.message}`); }
  }
  return errors;
}

async function collectPollArtifacts(directory, manifest) {
  const ids = new Set(manifest.pollIds);
  async function visit(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && /^poll-[a-f0-9-]{36}\.json$/.test(entry.name)) {
        const { pollId } = JSON.parse(await readFile(file, "utf8"));
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(pollId) || entry.name !== `poll-${pollId}.json`) throw new Error(`Invalid poll artifact: ${file}`);
        ids.add(pollId);
      }
    }
  }
  try { await visit(path.join(directory, "test-results")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  manifest.pollIds = [...ids];
}

export async function finishE2ERun(file, { origin = "automatic", interruption = null, failure = null, writerErrors = [], stopWriters, flushLogs = async () => [], client: suppliedClient, observe, kill } = {}) {
  const manifest = await readE2EManifest(file);
  const directory = path.dirname(file);
  const now = new Date().toISOString();
  const attempt = { attemptId: randomUUID(), startedAt: now, finishedAt: null, origin, outcome: null, interruption,
    phases: { writers: [], tables: [], diagnostics: [], dynamodb: "reused" }, tables: [] };
  manifest.cleanupAttempts.push(attempt);
  manifest.phase = interruption ? "interrupted" : "teardown";
  // Gate test/helper writes before stopping services or deleting tables.
  await saveE2EManifest(file, manifest);
  const resultDirectory = origin === "recovery" ? path.join(directory, "recovery", attempt.attemptId) : directory;
  await mkdir(resultDirectory, { recursive: true });
  const diagnostic = async (label, action) => {
    try { await action(); } catch (error) { attempt.phases.diagnostics.push(`${label}: ${error.message}`); }
  };
  await diagnostic("poll inventory", () => collectPollArtifacts(directory, manifest));
  attempt.phases.writers.push(...writerErrors);
  attempt.phases.writers.push(...await (stopWriters ? stopWriters(manifest) : stopOwnedWriters(manifest, { observe, kill })));
  await diagnostic("service log flush", async () => { attempt.phases.diagnostics.push(...await flushLogs()); });
  await diagnostic("shutdown log", () => writeFile(path.join(resultDirectory, "shutdown.log"), `${attempt.phases.writers.join("\n") || "Run-owned writers confirmed stopped."}\nDynamoDB reused and retained.\n`));
  const client = suppliedClient ?? e2eClient(manifest.configuration);
  try {
    if (!attempt.phases.writers.length) await cleanupE2ETables(file, manifest, client, attempt);
    else attempt.phases.tables.push("Table deletion deferred: run writers are not proved stopped. Stop verified writers, then preview selected-run recovery.");
  } finally { if (!suppliedClient) client.destroy(); }
  const cleanupErrors = [...attempt.phases.writers, ...attempt.phases.tables];
  attempt.finishedAt = new Date().toISOString();
  attempt.outcome = interruption ? "interrupted" : cleanupErrors.length ? "failed" : "complete";
  manifest.finishedAt ??= attempt.finishedAt;
  manifest.cleanupFinishedAt = attempt.finishedAt;
  manifest.phase = interruption ? "interrupted" : "finished";
  await saveE2EManifest(file, manifest);
  const remaining = attempt.tables.filter((table) => !["absent", "deleted"].includes(table.observation) || table.error).map(({ name }) => name);
  if (attempt.phases.writers.length) remaining.push(...manifest.tables.map(({ name }) => name));
  const summary = { runId: manifest.runId, manifestPath: file, mode: manifest.mode, stage: manifest.phase,
    startedAt: manifest.startedAt, finishedAt: manifest.finishedAt, elapsedMs: Date.parse(manifest.finishedAt) - Date.parse(manifest.startedAt),
    ports: { api: manifest.configuration.apiPort, web: manifest.configuration.webPort, dynamodb: manifest.configuration.dynamodbPort },
    testExitCode: null, finalExitCode: failure || interruption || cleanupErrors.length ? 1 : origin === "recovery" ? 0 : null, failure,
    cleanupFailure: cleanupErrors.length ? cleanupErrors.join("; ") : null, diagnosticFailures: attempt.phases.diagnostics,
    interruption, attemptId: attempt.attemptId, phases: attempt.phases, tables: attempt.tables,
    remainingTables: remaining, remainingServices: attempt.phases.writers.length ? manifest.services.processes : [],
    recoveryRequired: cleanupErrors.length > 0,
    recovery: { preview: `node scripts/recover-e2e-run.mjs preview "${file}"`, confirmRunId: manifest.runId,
      nextAction: cleanupErrors.length ? "Restore original DynamoDB connectivity, stop verified writers or investigate ownership; preview and confirm only this run." : "No remaining owned resources." } };
  await diagnostic("table cleanup log", () => writeFile(path.join(resultDirectory, "table-cleanup.log"), `${JSON.stringify(attempt, null, 2)}\n`));
  // Recovery never rewrites the original browser outcome/report/summary.
  await writeFile(path.join(resultDirectory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

export async function previewE2ERecovery(file, { client: suppliedClient, observe = observeProcess } = {}) {
  const manifest = await readE2EManifest(file);
  const coordinator = await observe(manifest.coordinator.pid);
  if (coordinator === manifest.coordinator.startTimeUtcFileTime) throw new Error("Recovery refused: original coordinator is live");
  const writers = [];
  for (const identity of manifest.services.processes) {
    const live = await observe(identity.pid);
    if (live !== null && live !== identity.startTimeUtcFileTime) throw new Error(`Recovery refused: ${identity.role} PID/start-time mismatch; unrelated process retained`);
    writers.push({ ...identity, state: live === null ? "stopped" : "owned-live" });
  }
  const client = suppliedClient ?? e2eClient(manifest.configuration);
  const tables = [];
  try {
    for (const table of manifest.tables) {
      try { tables.push({ role: table.role, name: table.name, priorCleanup: table.cleanup, ...await inspectE2ETable(client, manifest, table), error: null }); }
      catch (error) { tables.push({ role: table.role, name: table.name, priorCleanup: table.cleanup, state: "refused", error: error.message }); }
    }
  } finally { if (!suppliedClient) client.destroy(); }
  return { runId: manifest.runId, manifestPath: file, endpoint: manifest.endpoint, region: manifest.region, coordinator: "stopped", writers, tables,
    eligibleDeletionSet: tables.filter(({ state }) => state === "eligible").map(({ name }) => name) };
}

export async function recoverE2ERun(file, confirmedRunId, options = {}) {
  const preview = await previewE2ERecovery(file, options);
  if (confirmedRunId !== preview.runId) throw new Error("Recovery requires explicit confirmation of this exact run ID after preview");
  const lockFile = path.join(path.dirname(file), "recovery.lock");
  const lock = await open(lockFile, "wx");
  try {
    await lock.writeFile(`${JSON.stringify({ pid: process.pid, manifestPath: file, runId: preview.runId })}\n`);
    // Revalidate all global safety gates after acquiring exclusive coordination.
    await previewE2ERecovery(file, options);
    return await finishE2ERun(file, { ...options, origin: "recovery" });
  } finally { await lock.close(); await unlink(lockFile); }
}
