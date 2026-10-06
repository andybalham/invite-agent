import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { DescribeTableCommand, GetItemCommand, PutItemCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import { initializeTables } from "../../backend/dist/data/initialize-tables.js";
import { provisionE2ETables, readE2EManifest } from "../../backend/dist/adapters/local/e2e-resources.js";
import { finishE2ERun, previewE2ERecovery, recoverE2ERun } from "../../scripts/e2e-run-cleanup.mjs";
import { fixture } from "../support/e2e-resource-fixture.mjs";
import { disposableDynamoDB, tableNames } from "../support/disposable-dynamodb.mjs";
import { assertFailureEvidence, evidenceSnapshot, runCleanupProbe } from "../support/e2e-verification.mjs";

async function snapshot(client, names) {
  const result = {};
  for (const name of names) {
    const { Table } = await client.send(new DescribeTableCommand({ TableName: name }));
    const items = [];
    let key;
    do {
      const page = await client.send(new ScanCommand({ TableName: name, ConsistentRead: true, ExclusiveStartKey: key, Limit: 1 }));
      items.push(...page.Items);
      key = page.LastEvaluatedKey;
    } while (key);
    result[name] = { identity: Table.CreationDateTime.getTime(), items: items.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) };
  }
  return result;
}

test("private Docker database: repeated Playwright writes, failures and recovery preserve every unrelated record", { timeout: 300_000 }, async (t) => {
  const { endpoint, client } = await disposableDynamoDB(t);
  const protectedNames = ["invite-agent-local-app", "invite-agent-local-audit", "caller-app", "caller-audit"];
  for (const [appTableName, auditTableName] of [[protectedNames[0], protectedNames[1]], [protectedNames[2], protectedNames[3]]]) {
    await initializeTables(client, { appTableName, auditTableName }, { exclusive: true });
  }
  const other = await fixture(t, { DYNAMODB_ENDPOINT: endpoint });
  await provisionE2ETables(other.file, client);
  const otherManifest = await readFile(other.file, "utf8");
  protectedNames.push(...other.manifest.tables.map(({ name }) => name));
  for (const name of protectedNames) for (const sk of ["METADATA", "PARTICIPANT#sentinel", "NAME#sentinel", "EVENT#sentinel"]) {
    await client.send(new PutItemCommand({ TableName: name, Item: { PK: { S: "POLL#protected" }, SK: { S: sk }, document: { S: `preserve:${name}:${sk}` } } }));
  }
  const before = await snapshot(client, protectedNames);
  const savedEvidence = [];
  const runIds = new Set();
  for (const options of [{ repeat: 2 }, { repeat: 2 }, { mode: "failure" }, { mode: "timeout" }, { browserMissing: true }]) {
    const run = await runCleanupProbe(endpoint, options);
    t.diagnostic(`E2E evidence: ${run.directory}`);
    assert.equal(run.exit, options.mode || options.browserMissing ? 1 : 0, run.output);
    assert.equal(run.summary.recoveryRequired, false);
    assert.deepEqual(run.summary.remainingTables, []);
    assert.deepEqual(run.summary.remainingServices, []);
    assert.ok(run.manifest.tables.every(({ cleanup }) => cleanup === "deleted"));
    assert.equal(run.manifest.pollIds.length, options.browserMissing ? 0 : options.repeat ?? 1);
    assert.ok(!runIds.has(run.manifest.runId));
    runIds.add(run.manifest.runId);
    for (const { name } of run.manifest.tables) {
      await assert.rejects(client.send(new DescribeTableCommand({ TableName: name })), { name: "ResourceNotFoundException" });
      await assert.rejects(client.send(new GetItemCommand({ TableName: name, Key: { PK: { S: "E2E_RUN#OWNERSHIP" }, SK: { S: "METADATA" } }, ConsistentRead: true })), { name: "ResourceNotFoundException" });
    }
    if (options.mode || options.browserMissing) {
      assert.equal(run.summary.testExitCode, 1);
      assert.ok(run.summary.failure);
      if (options.mode === "timeout") assert.match(run.summary.failure, /timeout/i);
      if (options.browserMissing) assert.match(run.summary.failure, /executable|browserType.launch/i);
      await assertFailureEvidence(run.directory, { media: !options.browserMissing });
    }
    assert.deepEqual(await tableNames(client), [...protectedNames].sort());
    assert.deepEqual(await snapshot(client, protectedNames), before);
    assert.equal(await readFile(other.file, "utf8"), otherManifest);
    for (const [directory, evidence] of savedEvidence) assert.deepEqual(await evidenceSnapshot(directory), evidence);
    savedEvidence.push([run.directory, await evidenceSnapshot(run.directory)]);
  }
  // Inject only the selected audit delete. Every other call uses real DynamoDB.
  const partial = await fixture(t, { DYNAMODB_ENDPOINT: endpoint });
  await provisionE2ETables(partial.file, client);
  const auditName = partial.manifest.tables[1].name;
  const item = { PK: { S: "POLL#untracked" }, SK: { S: "EVENT#leftover" }, document: { S: "recover exactly this record/table" } };
  await client.send(new PutItemCommand({ TableName: auditName, Item: item }));
  const calls = [];
  let refuse = true;
  const controlled = { async send(command) {
    calls.push({ type: command.constructor.name, name: command.input.TableName });
    if (refuse && command.constructor.name === "DeleteTableCommand" && command.input.TableName === auditName) throw new Error("injected private audit delete failure");
    return client.send(command);
  } };
  const recoveryOptions = { client: controlled, observe: async () => null };
  const failed = await finishE2ERun(partial.file, { ...recoveryOptions, failure: "original browser assertion failure" });
  assert.equal(failed.finalExitCode, 1);
  assert.deepEqual(failed.remainingTables, [auditName]);
  assert.equal((await client.send(new GetItemCommand({ TableName: auditName, Key: { PK: item.PK, SK: item.SK }, ConsistentRead: true }))).Item.document.S, item.document.S);
  const evidence = await evidenceSnapshot(path.dirname(partial.file));
  refuse = false;
  const previewCalls = calls.length;
  assert.deepEqual((await previewE2ERecovery(partial.file, recoveryOptions)).eligibleDeletionSet, [auditName]);
  assert.ok(calls.slice(previewCalls).every(({ type }) => ["DescribeTableCommand", "GetItemCommand"].includes(type)));
  await assert.rejects(recoverE2ERun(partial.file, other.manifest.runId, recoveryOptions), /confirmation/);
  const retryStart = calls.length;
  const recovered = await recoverE2ERun(partial.file, partial.manifest.runId, recoveryOptions);
  assert.equal(recovered.finalExitCode, 0);
  assert.equal(recovered.recoveryRequired, false);
  assert.deepEqual(calls.slice(retryStart).filter(({ type }) => type === "DeleteTableCommand").map(({ name }) => name), [auditName]);
  const deletes = calls.filter(({ type }) => type === "DeleteTableCommand").length;
  await recoverE2ERun(partial.file, partial.manifest.runId, recoveryOptions);
  assert.equal(calls.filter(({ type }) => type === "DeleteTableCommand").length, deletes);
  assert.deepEqual(await evidenceSnapshot(path.dirname(partial.file)), evidence);
  const journal = await readE2EManifest(partial.file);
  assert.deepEqual(journal.cleanupAttempts.map(({ outcome }) => outcome), ["failed", "complete", "complete"]);
  assert.match(journal.cleanupAttempts[0].tables[1].error, /injected private audit delete failure/);
  assert.deepEqual(await tableNames(client), [...protectedNames].sort());
  assert.deepEqual(await snapshot(client, protectedNames), before);
  assert.equal(await readFile(other.file, "utf8"), otherManifest);
  for (const [directory, original] of savedEvidence) assert.deepEqual(await evidenceSnapshot(directory), original);
});
