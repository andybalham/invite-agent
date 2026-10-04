import assert from "node:assert/strict";
import test from "node:test";
import { PollService } from "../../backend/dist/application/index.js";

test("owned published detail reads reuse management data without exposing capabilities or writing", async () => {
  const participants = [{ id: "guest", displayName: "Sam", availability: { "poll-date-1": "yes" } }];
  let participantReads = 0;
  let stored = {
    id: "poll", organiserId: "owner", title: "Dinner", timeZone: "Europe/London",
    status: "draft", version: 1, publicTokenHash: "private-hash",
    proposedDates: [{ kind: "date", localDate: "2026-10-10" }, { kind: "date", localDate: "2026-10-11" }]
  };
  const service = new PollService({
    getPoll: async () => structuredClone(stored),
    listParticipants: async () => { participantReads += 1; return structuredClone(participants); }
  }, { baseUrl: "http://localhost", tokenHashKey: "test-key" });
  const draft = await service.get("poll", "owner");
  assert.equal(draft.participants, undefined);
  assert.equal(participantReads, 0);
  stored = { ...stored, status: "open" };
  const before = structuredClone(stored);
  const open = await service.get("poll", "owner");
  assert.deepEqual(open.participants, participants);
  assert.deepEqual(open.ranking, [{ choiceId: "poll-date-1", yesTotal: 1 }, { choiceId: "poll-date-2", yesTotal: 0 }]);
  assert.equal(open.proposedDates[0].id, "poll-date-1");
  await assert.rejects(service.get("poll", "other"), { code: "FORBIDDEN" });
  assert.equal(participantReads, 1, "ownership is checked before reading participants");
  assert.deepEqual(stored, before);
  stored = { ...stored, status: "closed", selectedDateId: "poll-date-2", frozenRanking: [{ choiceId: "poll-date-2", yesTotal: 2 }] };
  const closedBefore = structuredClone(stored);
  const closed = await service.get("poll", "owner");
  assert.deepEqual(closed.ranking, stored.frozenRanking);
  assert.equal(closed.selectedDateId, "poll-date-2");
  for (const response of [draft, open, closed]) {
    for (const key of ["organiserId", "publicTokenHash", "publicToken", "publicUrl"]) assert.equal(key in response, false);
  }
  assert.deepEqual(stored, closedBefore);
});
