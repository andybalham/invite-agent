import assert from "node:assert/strict";
import test from "node:test";

import { planIsolatedUndo } from "../../backend/dist/domain/index.js";

const participant = Object.freeze({
  id: "participant-1",
  pollId: "poll-1",
  displayName: "Alice Smith",
  normalizedName: "alice smith",
  availability: Object.freeze({ "poll-1-date-1": "yes", "poll-1-date-2": "no" }),
  createdAt: "2026-09-29T09:00:00.000Z",
  updatedAt: "2026-09-29T09:05:00.000Z"
});

test("isolated availability updates invert both binary values without mutating the current row", () => {
  for (const [before, after] of [["no", "yes"], ["yes", "no"]]) {
    const current = { ...participant, availability: { ...participant.availability, "poll-1-date-1": after } };
    const event = {
      action: "AVAILABILITY_CHANGED",
      entityId: "participant-1:poll-1-date-1",
      before: { value: before },
      after: { value: after }
    };
    const plan = planIsolatedUndo(event, current);
    assert.equal(plan.operation, "replace");
    assert.equal(plan.participant.availability["poll-1-date-1"], before);
    assert.equal(current.availability["poll-1-date-1"], after);
    assert.deepEqual(plan.auditBefore, event.after);
    assert.deepEqual(plan.auditAfter, event.before);
  }
});

test("isolated rename, add, and delete events produce exact inverse participant operations", () => {
  const renamed = planIsolatedUndo({
    action: "PARTICIPANT_RENAMED",
    entityId: participant.id,
    before: { displayName: "Alice" },
    after: { displayName: "Alice Smith" }
  }, participant);
  assert.equal(renamed.operation, "replace");
  assert.equal(renamed.participant.displayName, "Alice");
  assert.equal(renamed.participant.normalizedName, "alice");

  const added = planIsolatedUndo({
    action: "PARTICIPANT_ADDED",
    entityId: participant.id,
    before: null,
    after: { displayName: participant.displayName, availability: participant.availability }
  }, participant);
  assert.equal(added.operation, "delete");
  assert.equal(added.participant.id, participant.id);

  const deleted = planIsolatedUndo({
    action: "PARTICIPANT_DELETED",
    entityId: participant.id,
    before: { displayName: participant.displayName, availability: participant.availability },
    after: null
  }, undefined, { pollId: participant.pollId, occurredAt: "2026-09-29T10:00:00.000Z" });
  assert.equal(deleted.operation, "create");
  assert.equal(deleted.participant.id, participant.id);
  assert.equal(deleted.participant.displayName, participant.displayName);
  assert.deepEqual(deleted.participant.availability, participant.availability);
});

test("a later overlapping availability value produces an exact overwrite plan", () => {
  const current = {
    ...participant,
    availability: { ...participant.availability, "poll-1-date-1": "no" }
  };
  const plan = planIsolatedUndo({
    action: "AVAILABILITY_CHANGED",
    entityId: "participant-1:poll-1-date-1",
    before: { value: "no" },
    after: { value: "yes" }
  }, current);
  assert.equal(plan.wouldOverwrite, true);
  assert.equal(plan.participant.availability["poll-1-date-1"], "no");
  assert.deepEqual(plan.auditBefore, { value: "no" }, "audit before reflects the actual newer value");
  assert.deepEqual(plan.auditAfter, { value: "no" }, "undo restores the selected event's documented prior value");
  assert.match(plan.warning, /later change.*No.*overwrit/i);
});

test("unrelated later work does not turn an isolated undo into an overwrite", () => {
  const current = {
    ...participant,
    availability: { ...participant.availability, "poll-1-date-2": "yes" }
  };
  const plan = planIsolatedUndo({
    action: "AVAILABILITY_CHANGED",
    entityId: "participant-1:poll-1-date-1",
    before: { value: "no" },
    after: { value: "yes" }
  }, current);
  assert.equal(plan.wouldOverwrite, false);
  assert.equal(plan.warning, undefined);
  assert.equal(plan.participant.availability["poll-1-date-2"], "yes", "unrelated newer value is preserved");
});
