import assert from "node:assert/strict";
import test from "node:test";
import { createLifecycleFixture } from "../support/my-polls-lifecycle-fixture.mjs";
import { navigationOwners } from "../support/organiser-navigation-fixture.mjs";

const owner = navigationOwners.olivia;
const choices = [{ kind: "date", localDate: "2026-11-11" }, { kind: "date", localDate: "2026-11-10" }];

for (const [command, initialStatus, resultingStatus] of [
  ["update", "draft", "draft"], ["publish", "draft", "open"],
  ["close", "open", "closed"], ["reopen", "closed", "open"]
]) {
  test(`T-120 ${command} independently preserves an older poll's creation time, ordering and current count`, async () => {
    const fixture = createLifecycleFixture();
    const original = fixture.records.get("draft-1");
    original.status = initialStatus;
    if (initialStatus === "closed") original.selectedDateId = "draft-1-date-1";
    fixture.setParticipants(original.id, ["Ada", "Grace"]);
    fixture.records.get("open-1").status = resultingStatus;
    const input = command === "update" ? { title: "Older edited dinner", timeZone: original.timeZone, proposedDates: choices }
      : command === "close" ? { confirmed: true, selectedDateId: "draft-1-date-1" } : { confirmed: true };
    if (command === "publish") await fixture.service.publish(original.id, owner);
    else await fixture.service[command](original.id, input, owner);
    const page = await fixture.service.listOwned({ filter: resultingStatus }, owner);
    const summary = page.items.at(-1);
    assert.equal(summary.id, original.id, "older poll remains behind newer polls in its current filter");
    assert.equal(summary.createdAt, original.createdAt);
    assert.equal(summary.participantCount, 2);
    assert.equal(summary.status, resultingStatus);
    assert.equal(fixture.writes.length, 1, "command emits exactly one lifecycle/detail audit write");
  });
}

test("T-120 create/edit/publish/close/reopen summaries retain original creation time and order at every step", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-04T09:00:00.000Z") });
  const fixture = createLifecycleFixture();
  const { service, records, writes } = fixture;
  const created = await service.create({ title: "Newest dinner", timeZone: "Europe/London", proposedDates: [] }, owner);
  const original = records.get(created.id).createdAt;
  assert.equal(original, "2026-10-04T09:00:00.000Z");
  const oldId = "draft-1";
  const oldCreation = records.get(oldId).createdAt;

  async function summaries(status, title, dates, count) {
    const before = structuredClone({ records: [...records], writes });
    for (const filter of ["active", "draft", "open", "closed"]) {
      const page = await service.listOwned({ filter }, owner);
      const eligible = filter === status || (filter === "active" && status !== "closed");
      const summary = page.items.find(({ id }) => id === oldId);
      assert.equal(Boolean(summary), eligible, `${status} membership in ${filter}`);
      if (eligible) {
        assert.deepEqual(summary, { id: oldId, title, status, createdAt: oldCreation,
          timeZone: "Europe/London", proposedDates: dates, participantCount: count });
        assert.equal(page.items.at(-1).id, oldId, "older activity never promotes creation order");
      }
    }
    assert.deepEqual({ records: [...records], writes }, before, "list access adds no revisions or audit writes");
    assert.equal(records.get(created.id).createdAt, original);
  }

  t.mock.timers.tick(60_000);
  await service.update(created.id, { title: "Newest saved dinner", timeZone: "Europe/London", proposedDates: choices }, owner);
  assert.equal(records.get(created.id).createdAt, original);
  await service.update(oldId, { title: "Edited older dinner", timeZone: "Europe/London", proposedDates: choices }, owner);
  await summaries("draft", "Edited older dinner", choices, 0);
  t.mock.timers.tick(60_000);
  await service.publish(oldId, owner);
  fixture.setParticipants(oldId, ["Ada", "Grace"]);
  await summaries("open", "Edited older dinner", choices, 2);
  const selectedDateId = `${oldId}-date-1`;
  t.mock.timers.tick(60_000);
  await service.close(oldId, { confirmed: true, selectedDateId }, owner);
  await summaries("closed", "Edited older dinner", choices, 2);
  t.mock.timers.tick(60_000);
  await service.reopen(oldId, { confirmed: true }, owner);
  assert.equal(records.get(oldId).selectedDateId, selectedDateId);
  assert.equal(records.get(oldId).provisional, true);
  fixture.setParticipants(oldId, ["Ada"]);
  await summaries("open", "Edited older dinner", choices, 1);
  await service.close(oldId, { confirmed: true, selectedDateId }, owner);
  await summaries("closed", "Edited older dinner", choices, 1);
  assert.equal(records.get(oldId).provisional, undefined);
  assert.deepEqual(writes.map(({ audit }) => audit.action), ["POLL_CREATED", "POLL_DETAILS_UPDATED",
    "POLL_DETAILS_UPDATED", "POLL_PUBLISHED", "POLL_CLOSED", "POLL_REOPENED", "POLL_CLOSED"]);
  for (const { poll, audit } of writes.filter(({ poll }) => poll.id === oldId)) {
    assert.equal(poll.createdAt, oldCreation);
    assert.notEqual(audit.occurredAt, oldCreation);
  }
});

test("T-120 unconfirmed lifecycle commands cannot change dashboard membership or creation order", async () => {
  const fixture = createLifecycleFixture();
  const before = structuredClone([...fixture.records]);
  for (const confirmed of [false, undefined]) {
    await assert.rejects(fixture.service.close("open-1", { selectedDateId: "date-1", confirmed }, owner),
      { code: "VALIDATION_ERROR" });
    await assert.rejects(fixture.service.reopen("closed-1", { confirmed }, owner), { code: "VALIDATION_ERROR" });
  }
  assert.deepEqual([...fixture.records], before);
  assert.deepEqual(fixture.writes, []);
});
