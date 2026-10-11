import assert from "node:assert/strict";
import test from "node:test";
import { ownedPollSummarySchema } from "../../packages/contracts/dist/index.js";
import { toOwnedPollSummary } from "../../backend/dist/domain/index.js";
import { compactSummary } from "../support/compact-date-fixture.mjs";

function storedPoll(count, status = "draft") {
  const summary = compactSummary(count, { status });
  const { finalDate: _finalDate, ...poll } = summary;
  return { ...poll, organiserId: "owner", version: 1,
    proposedDates: poll.proposedDates.map((choice) => choice.kind === "date" ? choice : {
      ...choice, timeZone: poll.timeZone,
      utcInstant: choice.utcOffset === "+01:00" ? "2026-10-25T00:30:00.000Z" : "2026-10-25T01:30:00.000Z"
    }),
    ...(status === "closed" ? { selectedDateId: `${poll.id}-date-${count}` } : {})
  };
}

for (const count of [0, 1, 3, 4, 8, 9, 20]) {
  test(`T-153 projection keeps all ${count} choices detached and ordered; preview limits are presentation only`, () => {
    const poll = storedPoll(count);
    const before = structuredClone(poll);
    const result = toOwnedPollSummary(poll, 2);
    assert.deepEqual(result.proposedDates, compactSummary(count).proposedDates);
    assert.equal(result.proposedDates.length, count);
    assert.equal(result.participantCount, 2);
    assert.equal(ownedPollSummarySchema.safeParse(result).success, true);
    if (count) result.proposedDates[0].localDate = "2028-01-01";
    assert.deepEqual(poll, before);
  });
}

for (const index of [1, 2, 3, 8]) {
  test(`T-153 closed projection exposes detached finalDate for saved choice ${index + 1}`, () => {
    const poll = storedPoll(9, "closed");
    poll.selectedDateId = `${poll.id}-date-${index + 1}`;
    poll.publicTokenHash = "private-hash";
    poll.encryptedPublicToken = { ciphertext: "private-envelope" };
    const before = structuredClone(poll);
    const result = toOwnedPollSummary(poll, 2);
    assert.deepEqual(result.finalDate, compactSummary(9).proposedDates[index]);
    assert.equal(ownedPollSummarySchema.safeParse(result).success, true);
    assert.equal(Object.hasOwn(result, "selectedDateId"), false, "project the safe choice, not its internal ID");
    assert.equal(JSON.stringify(result).includes("private-"), false);
    assert.notEqual(result.finalDate, result.proposedDates[index]);
    if (result.finalDate.kind === "date") result.finalDate.localDate = "2028-01-01";
    else result.finalDate.utcOffset = "+09:00";
    assert.deepEqual(result.proposedDates, compactSummary(9).proposedDates);
    assert.deepEqual(poll, before);
  });
}

test("T-153 reopening never describes a provisional selection as final", () => {
  const poll = { ...storedPoll(9, "closed"), status: "open", provisional: true };
  assert.equal(Object.hasOwn(toOwnedPollSummary(poll, 2), "finalDate"), false);
});

test("T-153 summary schema accepts a safe saved finalDate only on closed polls", () => {
  const closed = compactSummary(9, { status: "closed" });
  assert.deepEqual(ownedPollSummarySchema.safeParse(closed), { success: true, data: closed });
  for (const value of [
    { ...closed, status: "draft" }, { ...closed, status: "open" },
    { ...closed, finalDate: { kind: "date", localDate: "2028-01-01" } },
    { ...closed, finalDate: { kind: "date", localDate: "2026-02-30" } },
    { ...closed, finalDate: { ...closed.finalDate, publicToken: "private" } }
  ]) assert.equal(ownedPollSummarySchema.safeParse(value).success, false, JSON.stringify(value));
});
