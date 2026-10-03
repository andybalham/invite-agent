import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createManifest } from "../../scripts/smoke-run-resources.mjs";

export const keyText = ({ PK, SK }) => `${PK.S}|${SK.S}`;
export const itemKey = (pk, sk) => ({ PK: { S: pk }, SK: { S: sk } });

export async function manifestFixture(t, endpoint = "http://127.0.0.1:18000", autoRemove = true) {
  const root = await mkdtemp(path.join(tmpdir(), "invite-cleanup-"));
  const dispose = () => rm(root, { recursive: true, force: true });
  if (autoRemove) t.after(dispose);
  const runId = `20261003t123456789z-${randomUUID().replaceAll("-", "")}`;
  const directory = path.join(root, runId);
  await mkdir(directory);
  const file = path.join(directory, "manifest.json");
  return { file, dispose, manifest: await createManifest(file, runId, endpoint) };
}

export function pollItems(pollId, { participants = 30, events = 60, padding = 0 } = {}) {
  const tokenHash = `token-${pollId}`;
  return {
    app: [
      { ...itemKey(`POLL#${pollId}`, "METADATA"), document: { S: JSON.stringify({ id: pollId, publicTokenHash: tokenHash }) } },
      { ...itemKey(`PUBLIC_TOKEN#${tokenHash}`, "CAPABILITY"), pollId: { S: pollId }, state: { S: "active" } },
      ...Array.from({ length: participants }, (_, index) => [
        { ...itemKey(`POLL#${pollId}`, `PARTICIPANT#${String(index).padStart(3, "0")}`), document: { S: "p".repeat(padding) } },
        { ...itemKey(`POLL#${pollId}`, `NAME#person-${index}`), participantId: { S: String(index) } }
      ]).flat()
    ],
    audit: Array.from({ length: events }, (_, index) => ({
      ...itemKey(`POLL#${pollId}`, `EVENT#${String(index).padStart(3, "0")}`), document: { S: "a".repeat(padding) }
    }))
  };
}

// Stateful fault injection: assertions inspect remaining records, not just command shapes.
export function memoryClient(pageSize = 7) {
  const tables = new Map();
  const calls = [];
  const client = {
    tables, calls, beforeSend: undefined,
    seed(name, items) {
      const table = tables.get(name) ?? new Map();
      for (const item of items) table.set(keyText(item), structuredClone(item));
      tables.set(name, table);
    },
    async send(command) {
      const type = command.constructor.name;
      const input = command.input;
      calls.push({ type, ...structuredClone(input) });
      const intercepted = await client.beforeSend?.(command);
      if (intercepted !== undefined) return intercepted;
      if (type === "CreateTableCommand") {
        if (tables.has(input.TableName)) throw Object.assign(new Error("table exists"), { name: "ResourceInUseException" });
        tables.set(input.TableName, new Map());
        return {};
      }
      if (type === "BatchWriteItemCommand") {
        for (const [name, requests] of Object.entries(input.RequestItems)) {
          const table = tables.get(name);
          if (!table) throw Object.assign(new Error(`Missing ${name}`), { name: "ResourceNotFoundException" });
          for (const request of requests) table.delete(keyText(request.DeleteRequest.Key));
        }
        return {};
      }
      const table = tables.get(input.TableName);
      if (!table) throw Object.assign(new Error(`Missing ${input.TableName}`), { name: "ResourceNotFoundException" });
      if (type === "DescribeTableCommand") return { Table: { TableStatus: "ACTIVE" } };
      if (type === "PutItemCommand") { table.set(keyText(input.Item), structuredClone(input.Item)); return {}; }
      if (type === "GetItemCommand") return { Item: table.get(keyText(input.Key)) };
      if (type === "DeleteTableCommand") { tables.delete(input.TableName); return {}; }
      if (type === "QueryCommand" || type === "ScanCommand") {
        const items = [...table.values()].filter((item) => type === "ScanCommand"
          ? item.PK.S.startsWith("POLL#") && item.SK.S === "METADATA"
          : item.PK.S === input.ExpressionAttributeValues[":pk"].S &&
            (!input.ExpressionAttributeValues[":prefix"] || item.SK.S.startsWith(input.ExpressionAttributeValues[":prefix"].S)))
          .sort((left, right) => keyText(left).localeCompare(keyText(right)));
        const start = input.ExclusiveStartKey ? items.findIndex((item) => keyText(item) === keyText(input.ExclusiveStartKey)) + 1 : 0;
        const page = items.slice(start, start + pageSize);
        return { Items: page.map(({ PK, SK }) => ({ PK, SK })),
          ...(start + pageSize < items.length ? { LastEvaluatedKey: itemKey(page.at(-1).PK.S, page.at(-1).SK.S) } : {}) };
      }
      throw new Error(`Unexpected ${type}`);
    }
  };
  return client;
}
