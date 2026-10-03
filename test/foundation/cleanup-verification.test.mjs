import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import { cleanupPoll, cleanupRun, parseArguments, validateLocalEndpoint } from "../../scripts/cleanup-local-data.mjs";
import { provisionTables, saveManifest } from "../../scripts/smoke-run-resources.mjs";
import { itemKey, keyText, manifestFixture, memoryClient, pollItems } from "../support/cleanup-fixture.mjs";

const pollId = "01234567-89ab-cdef-0123-456789abcdef";
const secondPoll = "abcdef01-2345-6789-abcd-ef0123456789";
const unrelatedPoll = "11111111-2222-3333-4444-555555555555";
const runId = "20261003t123456789z-0123456789abcdef0123456789abcdef";
const options = (client, id = pollId, confirm = true) => ({ client, appTableName: "app", auditTableName: "audit", pollId: id, confirm });
const snapshot = (client) => structuredClone([...client.tables]);
const mutates = ({ type }) => ["BatchWriteItemCommand", "DeleteTableCommand"].includes(type);

function seed(client, id = pollId, names = ["app", "audit"]) {
  const items = pollItems(id);
  client.seed(names[0], items.app);
  client.seed(names[1], items.audit);
}

test("explicit deletion paginates participants, name indexes and history, bounds batches and preserves unrelated records", async () => {
  const client = memoryClient();
  seed(client);
  seed(client, unrelatedPoll);
  const otherHistory = { ...itemKey(`POLL#${pollId}`, "OTHER#history"), value: { S: "preserved" } };
  client.seed("audit", [otherHistory]);
  const before = snapshot(client);
  const preview = await cleanupPoll(options(client, pollId, false));
  assert.equal(preview.dryRun, true);
  assert.equal(preview.confirmationRequired, true);
  assert.deepEqual(preview.counts, { pollItems: 61, auditItems: 60, capabilityItems: 1 });
  assert.deepEqual(snapshot(client), before);
  assert.equal(client.calls.some(mutates), false);

  const result = await cleanupPoll(options(client));
  assert.deepEqual(result.deleted, { appItems: 62, auditItems: 60 });
  const unrelated = pollItems(unrelatedPoll);
  assert.deepEqual([...client.tables.get("app").values()], unrelated.app);
  assert.deepEqual([...client.tables.get("audit").values()], [...unrelated.audit, otherHistory]);
  assert.ok(client.calls.filter(({ type }) => type === "QueryCommand").some(({ ExclusiveStartKey }) => ExclusiveStartKey));
  assert.ok(client.calls.filter(mutates).every(({ RequestItems }) => Object.values(RequestItems).every((items) => items.length <= 25)));
  assert.equal(client.calls.some(({ type }) => type === "ScanCommand"), false);
  assert.equal((await cleanupPoll(options(client))).status, "already-missing");
});

test("run cleanup previews and deletes every recorded poll, preserving unrecorded polls, markers and history", async (t) => {
  const { file } = await manifestFixture(t);
  const client = memoryClient();
  await provisionTables(file, client);
  const manifest = JSON.parse(await readFile(file, "utf8"));
  const names = manifest.tables.map(({ name }) => name);
  for (const id of [pollId, secondPoll, unrelatedPoll]) seed(client, id, names);
  manifest.pollIds = [pollId, secondPoll];
  const before = snapshot(client);
  const preview = await cleanupRun({ client, manifest });
  assert.equal(preview.confirmationRequired, true);
  assert.deepEqual(snapshot(client), before);
  const result = await cleanupRun({ client, manifest, confirm: true });
  assert.equal(result.status, "complete");
  assert.deepEqual(result.polls.map(({ pollId: id }) => id), manifest.pollIds);
  for (const [role, name] of [["app", names[0]], ["audit", names[1]]]) {
    assert.deepEqual([...client.tables.get(name).values()].filter(({ PK }) => PK.S !== "SMOKE_RUN#OWNERSHIP"), pollItems(unrelatedPoll)[role]);
  }
  assert.equal(client.calls.some(({ type }) => ["ScanCommand", "DeleteTableCommand"].includes(type)), false);
  const rerun = await cleanupRun({ client, manifest, confirm: true });
  assert.ok(rerun.polls.every(({ status }) => status === "already-missing"));
});

test("run ownership is checked on both tables before mutation, even with absent/deleted/unattempted manifest flags", async (t) => {
  const { file } = await manifestFixture(t);
  const client = memoryClient();
  await provisionTables(file, client);
  const manifest = JSON.parse(await readFile(file, "utf8"));
  const names = manifest.tables.map(({ name }) => name);
  seed(client, pollId, names);
  manifest.pollIds = [pollId];
  client.tables.get(names[1]).get("SMOKE_RUN#OWNERSHIP|METADATA").nonce.S = "replaced";
  const before = snapshot(client);
  for (const cleanup of ["pending", "deleted", "absent"]) {
    for (const table of manifest.tables) { table.cleanup = cleanup; table.creationAttempted = false; }
    await assert.rejects(cleanupRun({ client, manifest, confirm: true }), /ownership marker/);
  }
  assert.deepEqual(snapshot(client), before);
  assert.equal(client.calls.some(mutates), false);
});

test("metadata and capability ownership mismatches refuse all writes and preserve another poll", async () => {
  for (const fault of ["metadata", "capability"]) {
    const client = memoryClient();
    seed(client);
    seed(client, unrelatedPoll);
    const metadata = client.tables.get("app").get(keyText(itemKey(`POLL#${pollId}`, "METADATA")));
    metadata.document.S = JSON.stringify({ id: fault === "metadata" ? unrelatedPoll : pollId, publicTokenHash: `token-${unrelatedPoll}` });
    const before = snapshot(client);
    await assert.rejects(cleanupPoll(options(client)), /invalid metadata|ownership does not match/);
    assert.deepEqual(snapshot(client), before);
    assert.equal(client.calls.some(mutates), false);
  }
});

test("independently missing app/audit tables do not prevent remaining scoped deletion", async () => {
  for (const absent of ["app", "audit"]) {
    const client = memoryClient();
    seed(client);
    client.tables.delete(absent);
    const result = await cleanupPoll(options(client));
    assert.ok(result.missing.includes(absent));
    assert.equal(result.missing.includes(absent === "app" ? "audit" : "app"), false);
    assert.equal(client.tables.get(absent === "app" ? "audit" : "app").size, 0);
  }
  const result = await cleanupPoll(options(memoryClient()));
  assert.equal(result.status, "already-missing");
  assert.deepEqual(result.missing, ["app", "audit"]);
});

test("missing metadata reports unresolved capabilities without scanning or guessing, while deleting orphan history", async () => {
  const client = memoryClient();
  seed(client);
  client.tables.get("app").delete(keyText(itemKey(`POLL#${pollId}`, "METADATA")));
  const result = await cleanupPoll(options(client));
  assert.match(result.unresolved[0], /no token hash/);
  assert.equal(client.tables.get("app").size, 1);
  assert.equal(client.tables.get("audit").size, 0);
  assert.equal(client.calls.some(({ type }) => type === "ScanCommand"), false);
});

test("transient unprocessed deletes retry; exhausted or partial batches retain metadata and reruns recover", async () => {
  for (const failure of ["transient", "exhausted", "partial"]) {
    const client = memoryClient();
    seed(client);
    seed(client, unrelatedPoll);
    let writes = 0;
    client.beforeSend = (command) => {
      if (command.constructor.name !== "BatchWriteItemCommand") return;
      writes += 1;
      if (failure === "transient" && writes === 1) return { UnprocessedItems: command.input.RequestItems };
      if (failure === "exhausted" && command.input.RequestItems.app) return { UnprocessedItems: command.input.RequestItems };
      if (failure === "partial" && writes === 5) throw new Error("injected write failure");
    };
    if (failure === "transient") {
      await cleanupPoll(options(client));
    } else {
      await assert.rejects(cleanupPoll(options(client)), (error) => {
        assert.equal(error.cleanupResult.status, "failed");
        assert.equal(error.cleanupResult.pollId, pollId);
        assert.match(error.cleanupResult.error, /unprocessed deletes|injected write failure/);
        return true;
      });
      assert.ok(client.tables.get("app").has(keyText(itemKey(`POLL#${pollId}`, "METADATA"))));
      client.beforeSend = undefined;
      await cleanupPoll(options(client));
    }
    assert.deepEqual([...client.tables.get("app").values()], pollItems(unrelatedPoll).app);
    assert.deepEqual([...client.tables.get("audit").values()], pollItems(unrelatedPoll).audit);
  }
});

test("run failure reports the affected poll, completes other polls and supports a recovery rerun", async (t) => {
  const { file } = await manifestFixture(t);
  const client = memoryClient();
  await provisionTables(file, client);
  const manifest = JSON.parse(await readFile(file, "utf8"));
  manifest.pollIds = [pollId, secondPoll];
  for (const id of manifest.pollIds) seed(client, id, manifest.tables.map(({ name }) => name));
  client.beforeSend = (command) => {
    if (command.constructor.name === "BatchWriteItemCommand" && Object.values(command.input.RequestItems).flat().some(({ DeleteRequest }) => DeleteRequest.Key.PK.S === `POLL#${pollId}`)) {
      throw new Error("injected poll failure");
    }
  };
  const result = await cleanupRun({ client, manifest, confirm: true });
  assert.equal(result.status, "failed");
  assert.equal(result.polls[0].error, "injected poll failure");
  assert.equal(result.polls[1].dryRun, false);
  client.beforeSend = undefined;
  const rerun = await cleanupRun({ client, manifest, confirm: true });
  assert.equal(rerun.status, "complete");
  assert.equal(rerun.polls[1].status, "already-missing");
});

test("cleanup arguments and endpoints reject missing IDs, confirmation conflicts and non-local targets", () => {
  assert.deepEqual(parseArguments(["--poll-id", pollId, "--confirm"]), { poll_id: pollId, confirm: true });
  for (const args of [[], ["--poll-id"], ["--run-id"], ["--poll-id", pollId, "--run-id", runId], ["--poll-id", pollId, "--dry-run", "--confirm"], ["--unknown"]]) {
    assert.throws(() => parseArguments(args));
  }
  assert.equal(validateLocalEndpoint("http://localhost:18000"), "http://localhost:18000");
  for (const endpoint of [undefined, "https://dynamodb.eu-west-2.amazonaws.com", "http://example.test:18000", "https://127.0.0.1:18000", "http://127.0.0.1", "http://user:password@localhost:18000", "http://127.0.0.1:18000/path", "http://127.0.0.1:18000?query=1", "http://127.0.0.1:18000#fragment"]) {
    assert.throws(() => validateLocalEndpoint(endpoint));
  }
});

test("CLI refuses invalid modes, IDs, environment and malformed manifests before connecting", async (t) => {
  const { file, manifest } = await manifestFixture(t);
  const invoke = (args, env = {}) => spawnSync(process.execPath, ["scripts/cleanup-local-data.mjs", ...args], {
    encoding: "utf8", timeout: 5000, env: { ...process.env, APP_ENV: "test", ...env }
  });
  for (const [args, env, message] of [
    [[], {}, /exactly one/],
    [["--poll-id", "invalid", "--endpoint", "http://127.0.0.1:1", "--app-table", "app", "--audit-table", "audit", "--confirm"], {}, /Invalid poll ID/],
    [["--poll-id", pollId, "--endpoint", "https://dynamodb.eu-west-2.amazonaws.com", "--confirm"], {}, /loopback/],
    [["--poll-id", pollId], { APP_ENV: "production" }, /APP_ENV/],
    [["--poll-id", pollId, "--endpoint", "http://127.0.0.1:1"], { APP_TABLE_NAME: "", AUDIT_TABLE_NAME: "" }, /table names/],
    [["--run-id", "invalid"], {}, /Invalid smoke run ID/],
    [["--run-id", runId, "--manifest", file], {}, /does not match/],
    [["--run-id", manifest.runId, "--manifest", `${file}.missing`], {}, /ENOENT/]
  ]) {
    const result = invoke(args, env);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, message);
  }
  for (const mutate of [
    (value) => { value.pollIds = [pollId, "invalid"]; },
    (value) => { value.tables[1].name = "unrelated"; },
    (value) => { value.tables[0] = null; },
    (value) => { value.tables[0].cleanup = "unknown"; },
    (value) => { value.endpoint = "https://dynamodb.eu-west-2.amazonaws.com"; },
    (value) => { value.schemaVersion = 99; }
  ]) {
    const invalid = structuredClone(manifest);
    mutate(invalid);
    await saveManifest(file, invalid);
    const result = invoke(["--run-id", manifest.runId, "--manifest", file, "--confirm"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /manifest|loopback/);
  }
  await writeFile(file, "{broken", "utf8");
  assert.equal(invoke(["--run-id", manifest.runId, "--manifest", file]).status, 1);
});
