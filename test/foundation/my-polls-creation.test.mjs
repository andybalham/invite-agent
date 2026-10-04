import assert from "node:assert/strict";
import test from "node:test";
import { PollService } from "../../backend/dist/application/index.js";
import { DynamoPollRepository } from "../../backend/dist/data/dynamodb-poll-repository.js";
import * as domain from "../../backend/dist/domain/index.js";

// S-043 / MP-US-04,10: exercise actual lifecycle service writes, not a parallel state engine.
test("details/location edits, publication, close and reopen retain creation time and query position", async () => {
  const createdAt = "2026-09-01T08:00:00.000Z";
  let stored = {
    id: "old", organiserId: "owner", title: "Dinner", timeZone: "Europe/London",
    status: "draft", version: 1, createdAt,
    proposedDates: [{ kind: "date", localDate: "2026-10-10" }, { kind: "date", localDate: "2026-10-11" }]
  };
  const writes = [];
  const save = async (poll, audit) => { stored = structuredClone(poll); writes.push({ poll: stored, audit }); };
  const service = new PollService({ getPoll: async () => structuredClone(stored), listParticipants: async () => [],
    updatePoll: save, updateLocation: save, publishPoll: save, closePoll: save, reopenPoll: save },
  { baseUrl: "http://127.0.0.1:15173", tokenHashKey: "creation-invariant-test" });
  await service.update("old", { title: "Updated dinner", timeZone: stored.timeZone, proposedDates: stored.proposedDates }, "owner");
  await service.updateLocation("old", { location: "The hall" }, "owner");
  await service.publish("old", "owner");
  await service.close("old", { selectedDateId: "old-date-1", confirmed: true }, "owner");
  await service.reopen("old", { confirmed: true }, "owner");
  assert.deepEqual(writes.map(({ audit }) => audit.action), ["POLL_DETAILS_UPDATED", "LOCATION_CHANGED", "POLL_PUBLISHED", "POLL_CLOSED", "POLL_REOPENED"]);
  for (const { poll, audit } of writes) {
    assert.equal(poll.createdAt, createdAt);
    assert.notEqual(audit.occurredAt, createdAt);
  }
  assert.equal(typeof domain.selectOwnedPolls, "function");
  const newer = { ...stored, id: "new", createdAt: "2026-10-02T08:00:00.000Z" };
  assert.deepEqual(domain.selectOwnedPolls([stored, newer], "owner", { filter: "active", search: "", pageSize: 25 }).map(({ id }) => id), ["new", "old"]);
});

test("existing metadata write paths retain the owner creation index keys", async () => {
  const commands = [];
  const repository = new DynamoPollRepository({ send: async (command) => { commands.push(command); return {}; } },
    { appTableName: "app", auditTableName: "audit" });
  const poll = { id: "p", organiserId: "owner", createdAt: "2026-09-01T08:00:00.000Z", status: "open", version: 2, publicTokenHash: "hash" };
  const audit = { pollId: "p", id: "e", action: "POLL_DETAILS_UPDATED", actorId: "owner", actorCategory: "organiser",
    occurredAt: "2026-10-04T08:00:00.000Z", revision: 2, entityType: "poll", entityId: "p", before: {}, after: {} };
  for (const method of ["createPoll", "updatePoll", "updateLocation", "publishPoll", "closePoll", "reopenPoll"]) {
    await repository[method](poll, audit);
  }
  for (const command of commands) {
    const item = command.input.TransactItems[0].Put.Item;
    assert.equal(item.GSI1PK.S, "ORGANISER#owner");
    assert.equal(item.GSI1SK.S, `POLL#${poll.createdAt}#p`);
  }
});
