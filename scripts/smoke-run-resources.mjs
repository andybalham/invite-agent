import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DeleteTableCommand, DescribeTableCommand, DynamoDBClient, GetItemCommand,
  PutItemCommand, ScanCommand
} from "@aws-sdk/client-dynamodb";

const owner = "invite-a-gent-local-smoke";
const markerKey = { PK: { S: "SMOKE_RUN#OWNERSHIP" }, SK: { S: "METADATA" } };

export function tableNames(runId) {
  if (!/^\d{8}t\d{9}z-[a-f0-9]{32}$/.test(runId)) throw new Error("Invalid smoke run ID");
  return { app: `invite-agent-smoke-app-${runId}`, audit: `invite-agent-smoke-audit-${runId}` };
}

function localEndpoint(endpoint) {
  const url = new URL(endpoint);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Smoke resources require an explicit loopback HTTP DynamoDB endpoint");
  }
  return url.origin;
}

export async function saveManifest(file, manifest) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

export async function createManifest(file, runId, endpoint, region = "eu-west-2") {
  const names = tableNames(runId);
  const manifest = {
    schemaVersion: 1, owner, runId, ownershipNonce: randomUUID(),
    endpoint: localEndpoint(endpoint), region, createdAt: new Date().toISOString(),
    pollIds: [], tables: Object.entries(names).map(([role, name]) => ({
      role, name, creationAttempted: false, owned: false, cleanup: "pending"
    }))
  };
  // Never overwrite an existing run manifest.
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return manifest;
}

export function validateManifest(manifest) {
  const names = tableNames(manifest?.runId);
  if (manifest.schemaVersion !== 1 || manifest.owner !== owner ||
      !/^[a-f0-9-]{36}$/.test(manifest.ownershipNonce) ||
      !Array.isArray(manifest.pollIds) || !manifest.pollIds.every((id) =>
        typeof id === "string" && /^[a-f0-9-]{36}$/.test(id)) ||
      !Array.isArray(manifest.tables) || manifest.tables.length !== 2 ||
      !manifest.tables.every((table, index) => table?.role === ["app", "audit"][index] &&
        table.name === names[table.role] && typeof table.creationAttempted === "boolean" &&
        typeof table.owned === "boolean" && ["pending", "deleted", "absent", "failed"].includes(table.cleanup))) {
    throw new Error("Invalid smoke ownership manifest");
  }
  localEndpoint(manifest.endpoint);
  return manifest;
}

export async function readManifest(file) {
  const manifest = validateManifest(JSON.parse(await readFile(file, "utf8")));
  if (path.basename(path.dirname(path.resolve(file))) !== manifest.runId || path.basename(file) !== "manifest.json") {
    throw new Error("Invalid smoke ownership manifest path");
  }
  return manifest;
}

function clientFor(manifest) {
  return new DynamoDBClient({
    endpoint: localEndpoint(manifest.endpoint), region: manifest.region,
    credentials: { accessKeyId: "local", secretAccessKey: "local" }, maxAttempts: 2,
    requestHandler: { connectionTimeout: 2000, requestTimeout: 5000 }
  });
}

function markerFor(manifest, table) {
  return { ...markerKey, owner: { S: owner }, runId: { S: manifest.runId },
    nonce: { S: manifest.ownershipNonce }, role: { S: table.role } };
}

async function assertOwnership(client, manifest, table) {
  const { Item } = await client.send(new GetItemCommand({
    TableName: table.name, Key: markerKey, ConsistentRead: true
  }));
  const expected = markerFor(manifest, table);
  if (!Item || Object.keys(expected).some((key) => Item[key]?.S !== expected[key].S)) {
    throw new Error(`Refusing to delete ${table.name}: ownership marker does not match`);
  }
}

export async function assertManifestOwnership(client, manifest) {
  // Saved lifecycle flags cannot prove ownership of a table that exists now.
  for (const table of manifest.tables) {
    try { await assertOwnership(client, manifest, table); }
    catch (error) { if (error.name !== "ResourceNotFoundException") throw error; }
  }
}

export async function provisionTables(file, client) {
  // Startup builds first; manifest initialization must also work on a fresh checkout.
  const { initializeTables } = await import("../backend/dist/data/initialize-tables.js");
  const manifest = await readManifest(file);
  const actualClient = client ?? clientFor(manifest);
  try {
    // Persist intent before creating resources; cleanup can recover a partial startup.
    for (const table of manifest.tables) table.creationAttempted = true;
    await saveManifest(file, manifest);
    await initializeTables(actualClient, {
      appTableName: manifest.tables[0].name, auditTableName: manifest.tables[1].name
    }, {
      exclusive: true,
      onCreated: async (name) => {
        const table = manifest.tables.find((entry) => entry.name === name);
        await actualClient.send(new PutItemCommand({
          TableName: name, Item: markerFor(manifest, table),
          ConditionExpression: "attribute_not_exists(PK)"
        }));
        table.owned = true;
        await saveManifest(file, manifest);
      }
    });
  } finally { if (!client) actualClient.destroy(); }
}

export async function recordPoll(file, pollId) {
  if (!/^[a-f0-9-]{36}$/.test(pollId)) throw new Error("Invalid created poll ID");
  const manifest = await readManifest(file);
  if (!manifest.pollIds.includes(pollId)) {
    manifest.pollIds.push(pollId);
    await saveManifest(file, manifest);
  }
}

async function collectPollIds(client, table, manifest) {
  let cursor;
  do {
    const result = await client.send(new ScanCommand({
      TableName: table.name, ConsistentRead: true,
      ProjectionExpression: "PK, SK",
      FilterExpression: "begins_with(PK, :poll) AND SK = :metadata",
      ExpressionAttributeValues: { ":poll": { S: "POLL#" }, ":metadata": { S: "METADATA" } },
      ExclusiveStartKey: cursor
    }));
    for (const item of result.Items ?? []) {
      const id = item.PK.S.slice("POLL#".length);
      if (!manifest.pollIds.includes(id)) manifest.pollIds.push(id);
    }
    cursor = result.LastEvaluatedKey;
  } while (cursor);
}

// Callers must establish ownership before using this deletion primitive.
export async function deleteOwnedTable(client, name) {
  try {
    await client.send(new DeleteTableCommand({ TableName: name }));
    for (let attempt = 0; ; attempt += 1) {
      try { await client.send(new DescribeTableCommand({ TableName: name })); }
      catch (error) { if (error.name === "ResourceNotFoundException") return; throw error; }
      if (attempt >= 49) throw new Error(`Timed out deleting ${name}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } catch (error) {
    if (error.name !== "ResourceNotFoundException") throw error;
  }
}

export async function cleanupTables(file, client) {
  const manifest = await readManifest(file);
  const actualClient = client ?? clientFor(manifest);
  const failures = [];
  try {
    for (const table of manifest.tables) {
      if (!table.creationAttempted || table.cleanup === "deleted" || table.cleanup === "absent") continue;
      try {
        await assertOwnership(actualClient, manifest, table);
        table.owned = true;
        // Recover polls created before a fixture failure or lost HTTP response.
        if (table.role === "app") {
          await collectPollIds(actualClient, table, manifest);
          await saveManifest(file, manifest);
        }
        await deleteOwnedTable(actualClient, table.name);
        table.cleanup = "deleted";
        delete table.cleanupError;
      } catch (error) {
        if (error.name === "ResourceNotFoundException") {
          table.cleanup = "absent";
          delete table.cleanupError;
        } else {
          table.cleanup = "failed";
          table.cleanupError = error.message;
          failures.push(error.message);
        }
      }
      await saveManifest(file, manifest);
    }
    manifest.cleanupFinishedAt = new Date().toISOString();
    await saveManifest(file, manifest);
    if (failures.length) throw new Error(failures.join("; "));
  } finally { if (!client) actualClient.destroy(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [operation, file, runId, endpoint] = process.argv.slice(2);
  try {
    if (operation === "init") await createManifest(file, runId, endpoint, process.env.AWS_REGION);
    else if (operation === "provision") await provisionTables(file);
    else if (operation === "cleanup") await cleanupTables(file);
    else throw new Error("Unknown smoke resource operation");
    process.stdout.write(`Smoke resources ${operation}: ${file}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
