import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BatchWriteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  QueryCommand
} from "@aws-sdk/client-dynamodb";
import { assertManifestOwnership, readManifest } from "./smoke-run-resources.mjs";

const pollIdPattern = /^[a-f0-9-]{36}$/;
const runIdPattern = /^\d{8}t\d{9}z-[a-f0-9]{32}$/;
const localHosts = new Set(["127.0.0.1", "localhost"]);
const batchSize = 25;

export function validateLocalEndpoint(endpoint) {
  if (!endpoint) throw new Error("A DynamoDB endpoint is required; refusing an unspecified environment");
  const url = new URL(endpoint);
  if (url.protocol !== "http:" || !localHosts.has(url.hostname) || !url.port ||
      url.username || url.password || (url.pathname !== "/" && url.pathname !== "") ||
      url.search || url.hash) {
    throw new Error("Cleanup requires an explicit loopback HTTP DynamoDB endpoint");
  }
  return url.origin;
}

function requirePollId(pollId) {
  if (!pollId || !pollIdPattern.test(pollId)) throw new Error("Invalid poll ID");
  return pollId;
}

function requireRunId(runId) {
  if (!runId || !runIdPattern.test(runId)) throw new Error("Invalid smoke run ID");
  return runId;
}

function key(pk, sk) {
  return { PK: { S: pk }, SK: { S: sk } };
}

function isMissingTable(error) {
  return error?.name === "ResourceNotFoundException";
}

async function queryKeys(client, tableName, pollId, expression) {
  const keys = [];
  let cursor;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :pk" + (expression ? " AND begins_with(SK, :prefix)" : ""),
      ExpressionAttributeValues: expression
        ? { ":pk": { S: `POLL#${pollId}` }, ":prefix": { S: expression } }
        : { ":pk": { S: `POLL#${pollId}` } },
      ProjectionExpression: "PK, SK",
      ConsistentRead: true,
      ExclusiveStartKey: cursor
    }));
    keys.push(...(result.Items ?? []).map((item) => ({ PK: item.PK, SK: item.SK })));
    cursor = result.LastEvaluatedKey;
  } while (cursor);
  return keys;
}

async function getPoll(client, tableName, pollId) {
  const result = await client.send(new GetItemCommand({
    TableName: tableName,
    Key: key(`POLL#${pollId}`, "METADATA"),
    ProjectionExpression: "PK, SK, document",
    ConsistentRead: true
  }));
  return result.Item;
}

async function deleteKeys(client, tableName, keys) {
  const requests = keys.map((Key) => ({ DeleteRequest: { Key } }));
  for (let offset = 0; offset < requests.length; offset += batchSize) {
    let pending = requests.slice(offset, offset + batchSize);
    for (let attempt = 0; pending.length > 0; attempt += 1) {
      const result = await client.send(new BatchWriteItemCommand({ RequestItems: { [tableName]: pending } }));
      pending = result.UnprocessedItems?.[tableName] ?? [];
      if (pending.length > 0) {
        if (attempt >= 5) throw new Error(`DynamoDB returned unprocessed deletes for ${tableName}`);
        await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 25));
      }
    }
  }
}

function pollFromDocument(item, pollId) {
  if (!item?.document?.S) return undefined;
  try {
    const poll = JSON.parse(item.document.S);
    if (!poll || poll.id !== pollId || typeof poll.publicTokenHash !== "string") return poll;
    return poll;
  } catch {
    throw new Error(`Poll ${pollId} has invalid metadata`);
  }
}

export async function inspectPoll({ client, appTableName, auditTableName, pollId }) {
  requirePollId(pollId);
  const result = {
    pollId,
    appTable: appTableName,
    auditTable: auditTableName,
    status: "ready",
    missing: [],
    unresolved: [],
    counts: { pollItems: 0, auditItems: 0, capabilityItems: 0 },
    keys: { app: [], audit: [] }
  };
  let metadata;
  try {
    metadata = await getPoll(client, appTableName, pollId);
  } catch (error) {
    if (isMissingTable(error)) {
      result.status = "already-missing";
      result.missing.push(appTableName);
      result.missing.push(auditTableName);
      return result;
    }
    throw error;
  }
  if (!metadata) result.missing.push(`poll:${pollId}`);

  try {
    result.keys.app = await queryKeys(client, appTableName, pollId);
    result.keys.audit = await queryKeys(client, auditTableName, pollId, "EVENT#");
  } catch (error) {
    if (isMissingTable(error)) {
      result.status = "already-missing";
      result.missing.push(error.$metadata?.tableName ?? "table");
      return result;
    }
    throw error;
  }
  result.counts.pollItems = result.keys.app.length;
  result.counts.auditItems = result.keys.audit.length;

  const poll = pollFromDocument(metadata, pollId);
  if (poll?.publicTokenHash) {
    result.keys.app.push(key(`PUBLIC_TOKEN#${poll.publicTokenHash}`, "CAPABILITY"));
    result.counts.capabilityItems = 1;
  } else {
    result.unresolved.push("public-token-capability (poll metadata has no token hash)");
  }
  return result;
}

export async function cleanupPoll({ client, appTableName, auditTableName, pollId, confirm = false }) {
  const preview = await inspectPoll({ client, appTableName, auditTableName, pollId });
  if (!confirm || preview.status === "already-missing") {
    return { ...preview, dryRun: true, confirmationRequired: !confirm && preview.status !== "already-missing" };
  }
  await deleteKeys(client, appTableName, preview.keys.app);
  await deleteKeys(client, auditTableName, preview.keys.audit);
  return {
    ...preview,
    dryRun: false,
    confirmationRequired: false,
    deleted: { appItems: preview.keys.app.length, auditItems: preview.keys.audit.length }
  };
}

export async function cleanupRun({ client, manifest, confirm = false }) {
  const result = {
    runId: manifest.runId,
    endpoint: manifest.endpoint,
    tables: manifest.tables.map(({ role, name, cleanup, owned }) => ({ role, name, cleanup, owned })),
    dryRun: !confirm,
    confirmationRequired: !confirm,
    polls: []
  };
  for (const pollId of manifest.pollIds) {
    result.polls.push(await cleanupPoll({
      client,
      appTableName: manifest.tables.find(({ role }) => role === "app").name,
      auditTableName: manifest.tables.find(({ role }) => role === "audit").name,
      pollId,
      confirm
    }));
  }
  return result;
}

export function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run" || argument === "--confirm") {
      values[argument.slice(2).replaceAll("-", "_")] = true;
    } else if (["--poll-id", "--run-id", "--manifest", "--endpoint", "--app-table", "--audit-table"].includes(argument)) {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      values[argument.slice(2).replaceAll("-", "_")] = value;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (values.dry_run && values.confirm) throw new Error("--dry-run and --confirm cannot be used together");
  if ((values.poll_id ? 1 : 0) + (values.run_id ? 1 : 0) !== 1) {
    throw new Error("Specify exactly one of --poll-id or --run-id");
  }
  return values;
}

function clientFor(endpoint) {
  return new DynamoDBClient({
    endpoint,
    region: process.env.AWS_REGION ?? "eu-west-2",
    credentials: { accessKeyId: "local", secretAccessKey: "local" },
    maxAttempts: 2
  });
}

async function loadRunManifest(runId, manifestPath) {
  requireRunId(runId);
  const expected = path.resolve(manifestPath ?? path.join(".devstack", "smoke-runs", runId, "manifest.json"));
  const manifest = await readManifest(expected);
  if (manifest.runId !== runId) throw new Error("Manifest run ID does not match --run-id");
  return manifest;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (process.env.APP_ENV && !["local", "test"].includes(process.env.APP_ENV)) {
    throw new Error("Cleanup is allowed only when APP_ENV is local or test");
  }
  const confirm = Boolean(args.confirm);
  if (args.run_id) {
    const manifest = await loadRunManifest(args.run_id, args.manifest);
    const endpoint = validateLocalEndpoint(manifest.endpoint);
    if (args.endpoint && validateLocalEndpoint(args.endpoint) !== endpoint) {
      throw new Error("--endpoint does not match the manifest endpoint");
    }
    const client = clientFor(endpoint);
    try {
      if (confirm) await assertManifestOwnership(client, manifest);
      process.stdout.write(`${JSON.stringify(await cleanupRun({ client, manifest, confirm }), null, 2)}\n`);
    } finally {
      client.destroy();
    }
    return;
  }

  const endpoint = validateLocalEndpoint(args.endpoint ?? process.env.DYNAMODB_ENDPOINT);
  const appTableName = args.app_table ?? process.env.APP_TABLE_NAME;
  const auditTableName = args.audit_table ?? process.env.AUDIT_TABLE_NAME;
  if (!appTableName || !auditTableName) throw new Error("Explicit poll cleanup requires app and audit table names");
  const client = clientFor(endpoint);
  try {
    process.stdout.write(`${JSON.stringify(await cleanupPoll({
      client, appTableName, auditTableName, pollId: args.poll_id, confirm
    }), null, 2)}\n`);
  } finally {
    client.destroy();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
