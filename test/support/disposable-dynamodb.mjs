import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { integrationClient } from "./integration-fixture.mjs";

const execute = promisify(execFile);
async function docker(args) {
  return (await execute("docker", args, { windowsHide: true, timeout: 30_000 })).stdout.trim();
}

// Never inherit DYNAMODB_ENDPOINT or mount .dynamodb. Even protected-name
// sentinels are disposable copies inside this exclusively created container.
export async function disposableDynamoDB(t) {
  const name = `invite-agent-cleanup-verification-${randomUUID()}`;
  const id = await docker(["create", "--pull=never", "--name", name, "--publish", "127.0.0.1::8000",
    "amazon/dynamodb-local:2.6.1", "-jar", "DynamoDBLocal.jar", "-inMemory", "-sharedDb"]);
  assert.match(id, /^[a-f0-9]{64}$/);
  t.after(async () => { await docker(["rm", "--force", id]); });
  await docker(["start", id]);
  const binding = await docker(["port", id, "8000/tcp"]);
  assert.match(binding, /^127\.0\.0\.1:\d+$/);
  const endpoint = `http://${binding}`;
  const client = integrationClient(endpoint);
  t.after(() => client.destroy());
  const deadline = Date.now() + 20_000;
  for (;;) {
    try { await client.send(new ListTablesCommand({})); break; }
    catch (error) { if (Date.now() >= deadline) throw error; await delay(100); }
  }
  return { endpoint, client, id };
}

export async function tableNames(client) {
  const names = [];
  let cursor;
  do {
    const result = await client.send(new ListTablesCommand({ ExclusiveStartTableName: cursor }));
    names.push(...result.TableNames);
    cursor = result.LastEvaluatedTableName;
  } while (cursor);
  return names.sort();
}
