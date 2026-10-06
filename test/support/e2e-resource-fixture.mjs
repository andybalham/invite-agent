import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ResourceInUseException } from "@aws-sdk/client-dynamodb";
import { newRunId, resolveE2EConfiguration } from "../../backend/dist/adapters/local/e2e-config.js";
import { createE2EManifest } from "../../backend/dist/adapters/local/e2e-resources.js";

export function memoryClient() {
  const tables = new Map();
  const calls = [];
  return { tables, calls, beforeSend: null, async send(command) {
    const type = command.constructor.name;
    const { TableName: name } = command.input;
    calls.push({ type, ...command.input });
    await this.beforeSend?.(command);
    if (type === "CreateTableCommand") {
      if (tables.has(name)) throw new ResourceInUseException({ message: "race collision", $metadata: {} });
      tables.set(name, { schema: { ...command.input, TableStatus: "ACTIVE", CreationDateTime: new Date("2026-10-06T12:00:00.000Z"),
        BillingModeSummary: { BillingMode: "PAY_PER_REQUEST" },
        GlobalSecondaryIndexes: command.input.GlobalSecondaryIndexes?.map((index) => ({ ...index, IndexStatus: "ACTIVE" })) } });
      return {};
    }
    const table = tables.get(name);
    if (!table) throw Object.assign(new Error("absent"), { name: "ResourceNotFoundException" });
    if (type === "DescribeTableCommand") return { Table: structuredClone(table.schema) };
    if (type === "PutItemCommand") {
      assert.equal(command.input.ConditionExpression, "attribute_not_exists(PK)");
      if (table.marker) throw new Error("conditional marker collision");
      table.marker = structuredClone(command.input.Item);
      return {};
    }
    if (type === "GetItemCommand") { assert.equal(command.input.ConsistentRead, true); return { Item: structuredClone(table.marker) }; }
    if (type === "DeleteTableCommand") { tables.delete(name); return {}; }
    throw new Error(`Unexpected ${type}`);
  } };
}

export async function fixture(t, environment = {}) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "invite-e2e-resources-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runId = newRunId();
  const config = resolveE2EConfiguration(environment, runId);
  const directory = path.join(root, runId);
  await mkdir(directory);
  config.manifestPath = path.join(directory, "manifest.json");
  const coordinator = { pid: process.pid, startTimeUtcFileTime: "134356988979243596", runId, manifestPath: config.manifestPath };
  const manifest = await createE2EManifest(config, coordinator, ["controlled-test"]);
  return { config, manifest, file: config.manifestPath, client: memoryClient() };
}
