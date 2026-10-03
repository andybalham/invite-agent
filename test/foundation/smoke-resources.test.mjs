import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ResourceInUseException } from "@aws-sdk/client-dynamodb";
import {
  cleanupTables, createManifest, provisionTables, readManifest, recordPoll, saveManifest
} from "../../scripts/smoke-run-resources.mjs";

const runId = "20261003t123456789z-0123456789abcdef0123456789abcdef";
const firstPoll = "01234567-89ab-cdef-0123-456789abcdef";
const secondPoll = "abcdef01-2345-6789-abcd-ef0123456789";

async function fixture(action) {
  const root = await mkdtemp(path.join(tmpdir(), "invite-smoke-resources-"));
  const directory = path.join(root, runId);
  await mkdir(directory);
  const file = path.join(directory, "manifest.json");
  try {
    const manifest = await createManifest(file, runId, "http://127.0.0.1:18000");
    await action(file, manifest);
  } finally { await rm(root, { recursive: true, force: true }); }
}

function fakeClient() {
  const tables = new Map([["invite-agent-local-app", { marker: { preserved: true } }]]);
  const calls = [];
  return {
    tables, calls,
    async send(command) {
      const type = command.constructor.name;
      const { TableName: name } = command.input;
      calls.push({ type, ...command.input });
      if (type === "CreateTableCommand") {
        if (tables.has(name)) throw new ResourceInUseException({ message: "exists", $metadata: {} });
        tables.set(name, {});
        return {};
      }
      if (!tables.has(name)) throw Object.assign(new Error("absent"), { name: "ResourceNotFoundException" });
      if (type === "DescribeTableCommand") return { Table: { TableStatus: "ACTIVE" } };
      if (type === "PutItemCommand") { tables.get(name).marker = command.input.Item; return {}; }
      if (type === "GetItemCommand") return { Item: tables.get(name).marker };
      if (type === "ScanCommand") {
        return command.input.ExclusiveStartKey ? {
          Items: [{ PK: { S: `POLL#${secondPoll}` }, SK: { S: "METADATA" } }]
        } : {
          Items: [{ PK: { S: `POLL#${firstPoll}` }, SK: { S: "METADATA" } }],
          LastEvaluatedKey: { PK: { S: "cursor" }, SK: { S: "cursor" } }
        };
      }
      if (type === "DeleteTableCommand") { tables.delete(name); return {}; }
      throw new Error(`Unexpected ${type}`);
    }
  };
}

test("smoke tables retain the normal schemas and collect every poll before scoped, idempotent teardown", async () => {
  await fixture(async (file, initial) => {
    const client = fakeClient();
    await provisionTables(file, client);
    const creates = client.calls.filter(({ type }) => type === "CreateTableCommand");
    assert.equal(creates.length, 2);
    assert.equal(creates[0].GlobalSecondaryIndexes[0].IndexName, "GSI1");
    assert.equal(creates[1].GlobalSecondaryIndexes, undefined);
    await recordPoll(file, firstPoll);
    await recordPoll(file, firstPoll);
    await cleanupTables(file, client);
    const final = await readManifest(file);
    assert.deepEqual(final.pollIds, [firstPoll, secondPoll]);
    assert.ok(final.tables.every(({ owned, cleanup }) => owned && cleanup === "deleted"));
    assert.deepEqual([...client.tables.keys()], ["invite-agent-local-app"]);
    await cleanupTables(file, client);
    assert.deepEqual(client.calls.filter(({ type }) => type === "DeleteTableCommand").map(({ TableName }) => TableName), initial.tables.map(({ name }) => name));
  });
});

test("existing table collisions are never adopted or deleted", async () => {
  await fixture(async (file, manifest) => {
    const client = fakeClient();
    client.tables.set(manifest.tables[0].name, { marker: { someoneElse: true } });
    await assert.rejects(provisionTables(file, client), /exists/);
    await assert.rejects(cleanupTables(file, client), /ownership/);
    assert.deepEqual(client.tables.get(manifest.tables[0].name).marker, { someoneElse: true });
    assert.equal(client.calls.filter(({ type }) => type === "DeleteTableCommand").length, 0);
  });
});

test("partial provisioning tears down the acknowledged table while preserving a conflicting audit table", async () => {
  await fixture(async (file, manifest) => {
    const client = fakeClient();
    client.tables.set(manifest.tables[1].name, { marker: { someoneElse: true } });
    await assert.rejects(provisionTables(file, client), /exists/);
    await assert.rejects(cleanupTables(file, client), /ownership/);
    assert.equal(client.tables.has(manifest.tables[0].name), false);
    assert.equal(client.tables.has(manifest.tables[1].name), true);
  });
});

test("teardown refuses a replaced ownership marker and forged shared-table or remote targets", async () => {
  await fixture(async (file, manifest) => {
    const client = fakeClient();
    await provisionTables(file, client);
    client.tables.get(manifest.tables[0].name).marker.nonce.S = "different";
    await assert.rejects(cleanupTables(file, client), /ownership/);
    assert.equal(client.tables.has(manifest.tables[0].name), true);
    const actual = await readManifest(file);
    actual.tables[0].name = "invite-agent-local-app";
    await saveManifest(file, actual);
    await assert.rejects(cleanupTables(file, client), /manifest/);
    actual.tables[0].name = manifest.tables[0].name;
    actual.endpoint = "https://dynamodb.eu-west-2.amazonaws.com";
    await saveManifest(file, actual);
    await assert.rejects(cleanupTables(file, client), /loopback/);
    assert.equal(client.tables.has("invite-agent-local-app"), true);
  });
});
