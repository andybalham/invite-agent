import assert from "node:assert/strict";
import test from "node:test";
import { dashboardFixture, dashboardOwners } from "../support/my-polls-fixture.mjs";

test("dashboard fixtures isolate two owners, lifecycle states, dates and participant rows", async (t) => {
  const first = await dashboardFixture(t);
  const second = await dashboardFixture(t);
  assert.notEqual(first.app.config.appTableName, second.app.config.appTableName);
  for (const owner of dashboardOwners) {
    const owned = first.polls.filter((poll) => poll.organiserId === owner);
    assert.deepEqual(new Set(owned.map((poll) => poll.status)), new Set(["draft", "open", "closed"]));
    assert.equal(new Set(owned.map((poll) => poll.createdAt)).size, owned.length);
    assert.ok(owned.some((poll) => !poll.proposedDates.length));
    for (const poll of owned) {
      assert.equal((await first.app.repository.listParticipants(poll.id)).length, poll.participantCount);
      assert.equal(await second.app.repository.getPoll(poll.id), undefined);
    }
  }
});
