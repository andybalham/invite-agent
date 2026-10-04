import assert from "node:assert/strict";
import test from "node:test";
import { DynamoPollRepository } from "../../backend/dist/data/dynamodb-poll-repository.js";

const poll = { id: "p", organiserId: "owner", createdAt: "2026-01-01T00:00:00.000Z", title: "Dinner",
  status: "open", timeZone: "Europe/London", proposedDates: [], version: 4, participantCount: 2 };
const item = (value) => ({ document: { S: JSON.stringify(value) } });
const key = { PK: { S: "POLL#p" }, SK: { S: "METADATA" }, GSI1PK: { S: "ORGANISER#owner" }, GSI1SK: { S: `POLL#${poll.createdAt}#p` } };
const query = { filter: "active", search: "", pageSize: 25 };

test("stale index entries cannot disclose current foreign, closed, deleted or renamed metadata", async () => {
  for (const current of [undefined, { ...poll, organiserId: "foreign" }, { ...poll, status: "closed" }, { ...poll, title: "Other" }]) {
    const repository = new DynamoPollRepository({ send: async (command) => command.constructor.name === "QueryCommand"
      ? { Items: [key] } : { Item: current && item(current) } }, { appTableName: "app" });
    assert.deepEqual(await repository.listOwnedSummaries("owner", { ...query, search: "dinner" }), { items: [] });
  }
});

test("migration retries the complete count after a concurrent version change", async () => {
  const { participantCount: _, ...legacy } = poll;
  let revision = 4;
  let updates = 0;
  let counts = 0;
  const repository = new DynamoPollRepository({ send: async (command) => {
    if (command.constructor.name === "GetItemCommand") return { Item: item({ ...legacy, version: revision }) };
    if (command.constructor.name === "QueryCommand") { counts += 1; return { Count: revision === 4 ? 2 : 3 }; }
    updates += 1;
    if (updates === 1) { revision = 5; throw Object.assign(new Error("race"), { name: "ConditionalCheckFailedException" }); }
    assert.equal(command.input.ExpressionAttributeValues[":count"].N, "3");
    assert.equal(command.input.ExpressionAttributeValues[":version"].N, "5");
    return {};
  } }, { appTableName: "app" });
  await repository.backfillParticipantCount("p");
  assert.equal(counts, 2);
  assert.equal(updates, 2);
});

test("legacy metadata writers cannot overwrite a concurrently migrated count", async () => {
  const commands = [];
  const repository = new DynamoPollRepository({ send: async (command) => { commands.push(command); return {}; } }, { appTableName: "app", auditTableName: "audit" });
  const { participantCount: _, ...legacy } = poll;
  await repository.updatePoll(legacy, { before: {}, after: {} });
  assert.match(commands[0].input.TransactItems[0].Put.ConditionExpression, /attribute_not_exists\(participantCount\)/);
});
