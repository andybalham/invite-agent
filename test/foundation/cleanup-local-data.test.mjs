import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanupPoll, cleanupRun, parseArguments, validateLocalEndpoint
} from "../../scripts/cleanup-local-data.mjs";

const pollId = "01234567-89ab-cdef-0123-456789abcdef";
const runId = "20261003t123456789z-0123456789abcdef0123456789abcdef";

function fakeClient() {
  const app = new Map([
    [`POLL#${pollId}|METADATA`, { PK: { S: `POLL#${pollId}` }, SK: { S: "METADATA" }, document: { S: JSON.stringify({ id: pollId, publicTokenHash: "token-hash" }) } }],
    [`POLL#${pollId}|PARTICIPANT#p1`, { PK: { S: `POLL#${pollId}` }, SK: { S: "PARTICIPANT#p1" } }],
    [`POLL#${pollId}|NAME#alex`, { PK: { S: `POLL#${pollId}` }, SK: { S: "NAME#alex" } }],
    ["PUBLIC_TOKEN#token-hash|CAPABILITY", { PK: { S: "PUBLIC_TOKEN#token-hash" }, SK: { S: "CAPABILITY" } }]
  ]);
  const audit = new Map([
    [`POLL#${pollId}|EVENT#1`, { PK: { S: `POLL#${pollId}` }, SK: { S: "EVENT#1" } }],
    [`POLL#${pollId}|EVENT#2`, { PK: { S: `POLL#${pollId}` }, SK: { S: "EVENT#2" } }]
  ]);
  const calls = [];
  const keyText = (key) => `${key.PK.S}|${key.SK.S}`;
  return {
    app, audit, calls,
    async send(command) {
      const type = command.constructor.name;
      calls.push({ type, ...command.input });
      if (type === "GetItemCommand") return { Item: app.get(keyText(command.input.Key)) };
      if (type === "QueryCommand") {
        const source = command.input.TableName === "app" ? app : audit;
        const items = [...source.values()].filter((item) => item.PK.S === `POLL#${pollId}` &&
          (!command.input.ExpressionAttributeValues[":prefix"] || item.SK.S.startsWith(command.input.ExpressionAttributeValues[":prefix"].S)));
        const start = command.input.ExclusiveStartKey
          ? items.findIndex((item) => keyText(item) === keyText(command.input.ExclusiveStartKey)) + 1
          : 0;
        return {
          Items: items.slice(start, start + 1),
          ...(start + 1 < items.length ? { LastEvaluatedKey: items[start] } : {})
        };
      }
      if (type === "BatchWriteItemCommand") {
        for (const request of command.input.RequestItems[command.input.RequestItems.app ? "app" : "audit"] ?? []) {
          const target = command.input.RequestItems.app ? app : audit;
          target.delete(keyText(request.DeleteRequest.Key));
        }
        return { UnprocessedItems: {} };
      }
      throw new Error(`Unexpected ${type}`);
    }
  };
}

test("explicit poll cleanup previews without mutating and then deletes all related records", async () => {
  const client = fakeClient();
  const preview = await cleanupPoll({ client, appTableName: "app", auditTableName: "audit", pollId });
  assert.equal(preview.dryRun, true);
  assert.equal(preview.confirmationRequired, true);
  assert.equal(client.calls.some(({ type }) => type === "BatchWriteItemCommand"), false);
  assert.deepEqual(preview.counts, { pollItems: 3, auditItems: 2, capabilityItems: 1 });

  const result = await cleanupPoll({ client, appTableName: "app", auditTableName: "audit", pollId, confirm: true });
  assert.equal(result.dryRun, false);
  assert.equal(client.app.size, 0);
  assert.equal(client.audit.size, 0);
  assert.equal(client.calls.some(({ type }) => type === "ScanCommand"), false);
});

test("run cleanup uses only manifest poll IDs and preserves dry-run safety", async () => {
  const client = fakeClient();
  const manifest = {
    runId,
    endpoint: "http://127.0.0.1:18000",
    tables: [
      { role: "app", name: "app", cleanup: "pending", owned: true },
      { role: "audit", name: "audit", cleanup: "pending", owned: true }
    ],
    pollIds: [pollId]
  };
  const result = await cleanupRun({ client, manifest });
  assert.equal(result.confirmationRequired, true);
  assert.equal(result.polls[0].pollId, pollId);
  assert.equal(client.calls.some(({ type }) => type === "BatchWriteItemCommand"), false);
  assert.equal(client.calls.some(({ type }) => type === "ScanCommand"), false);
});

test("cleanup arguments and endpoint validation reject unsafe invocations", () => {
  assert.deepEqual(parseArguments(["--poll-id", pollId, "--confirm"]), { poll_id: pollId, confirm: true });
  assert.throws(() => parseArguments(["--poll-id", pollId, "--run-id", runId]), /exactly one/);
  assert.throws(() => parseArguments(["--poll-id", pollId, "--dry-run", "--confirm"]), /cannot/);
  assert.equal(validateLocalEndpoint("http://localhost:18000"), "http://localhost:18000");
  assert.throws(() => validateLocalEndpoint("https://dynamodb.eu-west-2.amazonaws.com"), /loopback/);
  assert.throws(() => validateLocalEndpoint("http://127.0.0.1:18000/path"), /loopback/);
});
