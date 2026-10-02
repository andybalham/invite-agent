import assert from "node:assert/strict";
import test from "node:test";
import * as contracts from "../../packages/contracts/dist/index.js";
import { DynamoPollRepository } from "../../backend/dist/data/dynamodb-poll-repository.js";

// S-024 / US-28–US-30: explicit confirmation and a public provisional selection.
test("reopen contracts require confirmation and describe a retained provisional selection", () => {
  assert.equal(typeof contracts.reopenPollRequestSchema?.safeParse, "function");
  assert.equal(contracts.reopenPollRequestSchema.safeParse({ confirmed: true }).success, true);
  for (const input of [{}, { confirmed: false }, { confirmed: true, selectedDateId: "d1" }]) {
    assert.equal(contracts.reopenPollRequestSchema.safeParse(input).success, false);
  }
  const poll = {
    id: "poll", title: "Reopened", status: "open", version: 4, timeZone: "Europe/London",
    proposedDates: [{ id: "d1", kind: "date", localDate: "2026-10-10" }],
    participants: [], ranking: [{ choiceId: "d1", yesTotal: 0 }], selectedDateId: "d1", provisional: true
  };
  assert.equal(contracts.publicPollResponseSchema.safeParse(poll).success, true);
  assert.equal(contracts.reopenPollResultSchema.safeParse({ poll }).success, true);
  for (const invalid of [
    { ...poll, provisional: false }, { ...poll, selectedDateId: undefined },
    { ...poll, status: "closed" }, { ...poll, provisional: "true" }
  ]) assert.equal(contracts.reopenPollResultSchema.safeParse({ poll: invalid }).success, false);
});

test("reopen repository puts poll and one immutable revision in a version-guarded transaction", async () => {
  const commands = [];
  const repository = new DynamoPollRepository({ send: async (command) => { commands.push(command); } }, {
    appTableName: "app", auditTableName: "audit"
  });
  assert.equal(typeof repository.reopenPoll, "function");
  const poll = { id: "poll", organiserId: "owner", status: "open", version: 4, createdAt: "2026-10-02T12:00:00Z", selectedDateId: "d1", provisional: true };
  const event = { pollId: "poll", id: "event", action: "POLL_REOPENED", actorId: "owner", actorCategory: "organiser", occurredAt: "2026-10-02T12:00:01Z", revision: 4, entityType: "poll", entityId: "poll", before: { status: "closed" }, after: { status: "open" } };
  await repository.reopenPoll(poll, event);
  assert.equal(commands.length, 1);
  const items = commands[0].input.TransactItems;
  assert.equal(items.length, 2);
  assert.equal(items[0].Put.TableName, "app");
  assert.equal(items[0].Put.ExpressionAttributeValues[":previousVersion"].N, "3");
  assert.match(items[0].Put.ConditionExpression, /#version = :previousVersion/);
  assert.deepEqual(JSON.parse(items[0].Put.Item.document.S), poll);
  assert.equal(items[1].Put.TableName, "audit");
  assert.equal(items[1].Put.Item.action.S, "POLL_REOPENED");
  assert.equal(items[1].Put.ConditionExpression, "attribute_not_exists(PK) AND attribute_not_exists(SK)");
});
