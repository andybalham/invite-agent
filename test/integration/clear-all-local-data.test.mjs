import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { GetItemCommand, ListTablesCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { initializeTables } from "../../backend/dist/data/initialize-tables.js";
import { integrationClient } from "../support/integration-fixture.mjs";

// Never use DYNAMODB_ENDPOINT/PORT here: reset discovers every supported table.
// A dedicated in-memory container has no mounts and cannot contain retained data.
test("all-local CLI against a dedicated disposable DynamoDB instance", { timeout: 90_000 }, async (t) => {
  const name = `invite-s042-${randomUUID()}`;
  const docker = (args) => execFileSync("docker", args, { encoding: "utf8", timeout: 30_000 }).trim();
  const container = docker(["run", "--rm", "-d", "--name", name, "--label", "invite-agent.fixture=S-042",
    "-p", "127.0.0.1::8000", "amazon/dynamodb-local:2.6.1", "-jar", "DynamoDBLocal.jar", "-inMemory", "-sharedDb"]);
  assert.match(container, /^[a-f0-9]{64}$/);
  t.after(() => docker(["rm", "-f", container]));
  const binding = docker(["port", container, "8000/tcp"]);
  assert.match(binding, /^127\.0\.0\.1:\d+$/);
  const endpoint = `http://${binding}`;
  const client = integrationClient(endpoint);
  t.after(() => client.destroy());
  for (let attempt = 0; ; attempt += 1) {
    try { await client.send(new ListTablesCommand({})); break; }
    catch (error) {
      if (attempt >= 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  const uuid = randomUUID();
  const run = `20261003t123456789z-${uuid.replaceAll("-", "")}`;
  const pairs = [
    { appTableName: "invite-agent-local-app", auditTableName: "invite-agent-local-audit" },
    { appTableName: `invite-agent-smoke-app-${run}`, auditTableName: `invite-agent-smoke-audit-${run}` },
    { appTableName: `invite-agent-test-app-${uuid}`, auditTableName: `invite-agent-test-audit-${uuid}` }
  ];
  const unrelated = { appTableName: "invite-agent-local-app-backup", auditTableName: "unrelated-audit" };
  const sentinel = { PK: { S: "sentinel" }, SK: { S: "preserve" }, document: { S: "unchanged" } };
  const key = { PK: sentinel.PK, SK: sentinel.SK };
  for (const pair of [...pairs, unrelated]) {
    await initializeTables(client, pair, { exclusive: true });
    for (const table of Object.values(pair)) {
      // One supported empty table verifies deletion is independent of item count.
      if (table === pairs[2].auditTableName) continue;
      await client.send(new PutItemCommand({ TableName: table, Item: sentinel }));
      if (table === pairs[0].appTableName) {
        await client.send(new PutItemCommand({ TableName: table, Item: {
          PK: { S: "PUBLIC_TOKEN#orphan" }, SK: { S: "CAPABILITY" }, GSI1PK: { S: "index" }, GSI1SK: { S: "record" }
        } }));
      }
    }
  }
  const invoke = (args = []) => {
    const result = spawnSync(process.execPath, ["scripts/clear-all-local-data.mjs", "--endpoint", endpoint, ...args], {
      encoding: "utf8", timeout: 30_000, env: { ...process.env, APP_ENV: "test",
        APP_TABLE_NAME: pairs[0].appTableName, AUDIT_TABLE_NAME: pairs[0].auditTableName,
        // Explicit client configuration must take precedence over ambient AWS targets.
        AWS_ENDPOINT_URL: "https://example.invalid", AWS_ENDPOINT_URL_DYNAMODB: "https://example.invalid" }
    });
    assert.equal(result.error, undefined);
    return { ...result, reports: result.stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) };
  };
  const names = async () => (await client.send(new ListTablesCommand({}))).TableNames.sort();
  const before = await names();
  await t.test("default and explicit previews leave shared/smoke/integration and unrelated records intact", async () => {
    for (const args of [[], ["--dry-run"]]) {
      const result = invoke(args);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.reports.length, 1);
      assert.equal(result.reports[0].summary.ready, 6);
      assert.deepEqual(await names(), before);
      for (const pair of [...pairs, unrelated]) {
        assert.deepEqual((await client.send(new GetItemCommand({ TableName: pair.appTableName, Key: key, ConsistentRead: true }))).Item, sentinel);
      }
    }
  });
  await t.test("conflicting authorization refuses without deleting", async () => {
    assert.equal(invoke(["--dry-run", "--force"]).status, 1);
    assert.equal(invoke(["--confirm", "yes"]).status, 1);
    assert.deepEqual(await names(), before);
  });
  await t.test("confirmed reset removes exactly six supported tables, including indexes and orphan records", async () => {
    const result = invoke(["--confirm", "DELETE ALL LOCAL DATA"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.reports.map(({ phase }) => phase), ["preview", "result"]);
    assert.deepEqual(result.reports[1].summary, { ready: 0, deleted: 6, skipped: 2, failed: 0 });
    assert.deepEqual(await names(), Object.values(unrelated).sort());
    for (const name of Object.values(unrelated)) {
      assert.deepEqual((await client.send(new GetItemCommand({ TableName: name, Key: key, ConsistentRead: true }))).Item, sentinel);
    }
  });
  await t.test("force rerun is harmless and normal initialization restores empty shared tables", async () => {
    const result = invoke(["--force"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.reports[1].summary.deleted, 0);
    assert.equal(result.reports[1].summary.skipped, 4);
    await initializeTables(client, pairs[0], { exclusive: true });
    for (const name of Object.values(pairs[0])) {
      assert.equal((await client.send(new GetItemCommand({ TableName: name, Key: key, ConsistentRead: true }))).Item, undefined);
    }
    const empty = invoke(["--force"]);
    assert.equal(empty.status, 0, empty.stderr);
    assert.equal(empty.reports[1].summary.deleted, 2);
  });
});
