import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { ListTablesCommand, PutItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { integrationClient, ownedTables } from "../support/integration-fixture.mjs";
import { randomUUID } from "node:crypto";

const endpoint = process.env.DYNAMODB_ENDPOINT ?? `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`;
async function tableNames(client) {
  const names = [];
  let cursor;
  do {
    const page = await client.send(new ListTablesCommand({ ExclusiveStartTableName: cursor }));
    names.push(...page.TableNames);
    cursor = page.LastEvaluatedTableName;
  } while (cursor);
  return names;
}

test("forced setup/assertion failures delete their tables and retain original Node test failure reporting", async () => {
  const client = integrationClient(endpoint);
  try {
    // Other integration files run concurrently; inspect only this child's UUID pairs.
    for (const mode of ["setup", "assertion", "assertion-cleanup", "cleanup-only"]) {
      const childEnv = { ...process.env, DYNAMODB_ENDPOINT: endpoint, INTEGRATION_FAILURE_MODE: mode };
      delete childEnv.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "test/support/integration-failure-child.mjs"], {
        encoding: "utf8", timeout: 30_000,
        env: childEnv
      });
      assert.equal(result.error, undefined, `child did not finish: ${result.error}`);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      const output = result.stdout + result.stderr;
      const expected = mode === "setup" ? "ORIGINAL_SETUP_FAILURE" : mode === "cleanup-only" ? "SECONDARY_CLEANUP_FAILURE" : "ORIGINAL_ASSERTION_FAILURE";
      assert.match(output, new RegExp(`error:.*${expected}`));
      if (mode.includes("cleanup")) assert.match(output, /Integration cleanup failed:.*SECONDARY_CLEANUP_FAILURE/);
      const owned = [...output.matchAll(/OWNED_TABLE:(invite-agent-test-[a-z]+-[a-f0-9-]+)/g)].map((match) => match[1]);
      assert.equal(owned.length, mode === "setup" ? 1 : 2);
      const remaining = await tableNames(client);
      assert.deepEqual(remaining.filter((name) => owned.includes(name)), []);
    }
  } finally { client.destroy(); }
});

test("real deletion is idempotent and preserves unrelated local/smoke sentinel data", async () => {
  const client = integrationClient(endpoint);
  const sentinel = ownedTables(client);
  const target = ownedTables(client);
  const id = randomUUID();
  const unrelated = { appTableName: `invite-agent-local-app-sentinel-${id}`, auditTableName: `invite-agent-smoke-audit-sentinel-${id}` };
  const names = { appTableName: `invite-agent-test-app-${id}`, auditTableName: `invite-agent-test-audit-${id}` };
  const item = { PK: { S: "sentinel" }, SK: { S: "preserve" }, document: { S: "unchanged" } };
  try {
    await sentinel.initialize(unrelated);
    for (const name of Object.values(unrelated)) await client.send(new PutItemCommand({ TableName: name, Item: item }));
    await target.initialize(names);
    await target.cleanup();
    await target.cleanup();
    for (const name of Object.values(unrelated)) {
      const result = await client.send(new GetItemCommand({ TableName: name, Key: { PK: item.PK, SK: item.SK }, ConsistentRead: true }));
      assert.deepEqual(result.Item, item);
    }
    assert.deepEqual((await tableNames(client)).filter((name) => Object.values(names).includes(name)), []);
  } finally {
    try { await target.cleanup(); }
    finally { try { await sentinel.cleanup(); } finally { client.destroy(); } }
  }
});
