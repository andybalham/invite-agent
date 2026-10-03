import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { BatchWriteItemCommand, DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { cleanupPoll, cleanupRun, validateLocalEndpoint } from "../../scripts/cleanup-local-data.mjs";
import { cleanupTables, provisionTables, readManifest, recordPoll } from "../../scripts/smoke-run-resources.mjs";
import { keyText, manifestFixture, pollItems } from "../support/cleanup-fixture.mjs";

const endpoint = validateLocalEndpoint(process.env.DYNAMODB_ENDPOINT ?? `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`);

async function fixture(t) {
  const { file, manifest, dispose } = await manifestFixture(t, endpoint, false);
  const client = new DynamoDBClient({ endpoint, region: "eu-west-2", credentials: { accessKeyId: "local", secretAccessKey: "local" }, maxAttempts: 2 });
  // Cleanup before the temporary manifest directory is removed, even on an assertion failure.
  t.after(async () => {
    try { await cleanupTables(file, client); await dispose(); }
    finally { client.destroy(); }
  });
  await provisionTables(file, client);
  return { file, manifest, client, names: manifest.tables.map(({ name }) => name) };
}

async function seed(client, names, id, large = false) {
  // DynamoDB's 1 MiB query limit applies even when the projection returns only keys.
  const items = pollItems(id, large ? { participants: 40, events: 60, padding: 30_000 } : { participants: 2, events: 3 });
  for (const [role, name] of [["app", names[0]], ["audit", names[1]]]) {
    for (let offset = 0; offset < items[role].length; offset += 25) {
      const result = await client.send(new BatchWriteItemCommand({
        RequestItems: { [name]: items[role].slice(offset, offset + 25).map((Item) => ({ PutRequest: { Item } })) }
      }));
      assert.equal(Object.values(result.UnprocessedItems ?? {}).flat().length, 0);
    }
  }
}

async function records(client, name) {
  const items = [];
  let cursor;
  do {
    const page = await client.send(new ScanCommand({ TableName: name, ConsistentRead: true, ExclusiveStartKey: cursor }));
    items.push(...(page.Items ?? []));
    cursor = page.LastEvaluatedKey;
  } while (cursor);
  return items.sort((a, b) => keyText(a).localeCompare(keyText(b)));
}

function observe(client) {
  const calls = [];
  return { calls, async send(command) { calls.push({ type: command.constructor.name, ...command.input }); return client.send(command); } };
}

test("real DynamoDB explicit cleanup crosses app/audit pages and preserves an unrelated poll byte for byte", async (t) => {
  const { client, names } = await fixture(t);
  const target = randomUUID();
  const unrelated = randomUUID();
  await seed(client, names, target, true);
  await seed(client, names, unrelated);
  const unrelatedBefore = await Promise.all(names.map(async (name) => (await records(client, name)).filter(({ PK }) => PK.S.includes(unrelated))));
  const observed = observe(client);
  const options = { client: observed, appTableName: names[0], auditTableName: names[1], pollId: target };
  const before = await Promise.all(names.map((name) => records(client, name)));
  const preview = await cleanupPoll(options);
  assert.deepEqual(preview.counts, { pollItems: 81, auditItems: 60, capabilityItems: 1 });
  assert.deepEqual(await Promise.all(names.map((name) => records(client, name))), before);
  const deleted = await cleanupPoll({ ...options, confirm: true });
  assert.deepEqual(deleted.deleted, { appItems: 82, auditItems: 60 });
  for (const name of names) {
    assert.ok(observed.calls.some(({ type, TableName, ExclusiveStartKey }) => type === "QueryCommand" && TableName === name && ExclusiveStartKey), `No actual pagination for ${name}`);
    assert.equal((await records(client, name)).some(({ PK }) => PK.S.includes(target)), false);
  }
  assert.deepEqual(await Promise.all(names.map(async (name) => (await records(client, name)).filter(({ PK }) => PK.S.includes(unrelated)))), unrelatedBefore);
  assert.equal((await cleanupPoll({ ...options, confirm: true })).status, "already-missing");
  assert.equal(observed.calls.some(({ type }) => type === "ScanCommand"), false);
});

test("real run-ID CLI requires confirmation, deletes all recorded paginated polls and preserves unrecorded history", async (t) => {
  const { file, client, names, manifest } = await fixture(t);
  const targets = [randomUUID(), randomUUID()];
  const unrelated = randomUUID();
  for (const id of targets) { await seed(client, names, id, true); await recordPoll(file, id); }
  await seed(client, names, unrelated);
  const before = await Promise.all(names.map((name) => records(client, name)));
  const invoke = (extra = []) => spawnSync(process.execPath, ["scripts/cleanup-local-data.mjs", "--run-id", manifest.runId, "--manifest", file, ...extra], {
    encoding: "utf8", timeout: 30_000, env: { ...process.env, APP_ENV: "test" }
  });
  for (const extra of [[], ["--dry-run"]]) {
    const preview = invoke(extra);
    assert.equal(preview.status, 0, preview.stderr);
    assert.equal(JSON.parse(preview.stdout).confirmationRequired, true);
    assert.deepEqual(await Promise.all(names.map((name) => records(client, name))), before);
  }
  const conflict = invoke(["--dry-run", "--confirm"]);
  assert.equal(conflict.status, 1);
  assert.match(conflict.stderr, /cannot be used together/);
  const wrongEndpoint = invoke(["--endpoint", "http://127.0.0.1:1", "--confirm"]);
  assert.equal(wrongEndpoint.status, 1);
  assert.match(wrongEndpoint.stderr, /does not match/);
  const cleaned = invoke(["--confirm"]);
  assert.equal(cleaned.status, 0, cleaned.stderr);
  const report = JSON.parse(cleaned.stdout);
  assert.equal(report.status, "complete");
  assert.ok(report.polls.every(({ deleted }) => deleted.appItems === 82 && deleted.auditItems === 60));
  const remaining = await Promise.all(names.map((name) => records(client, name)));
  assert.deepEqual(remaining, before.map((items) => items.filter(({ PK }) => !targets.some((id) => PK.S.includes(id)))));
  const rerun = invoke(["--confirm"]);
  assert.equal(rerun.status, 0, rerun.stderr);
  assert.ok(JSON.parse(rerun.stdout).polls.every(({ status }) => status === "already-missing"));
  // A missing app table must not hide remaining audit events during recovery.
  await cleanupTables(file, client);
  const absent = await cleanupRun({ client, manifest: await readManifest(file), confirm: true });
  assert.ok(absent.polls.every(({ status }) => status === "already-missing"));
});
