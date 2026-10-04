import assert from "node:assert/strict";
import test from "node:test";
import { createSummaryFixture, emptyPage, failedPage, heldResponse, savedChoices, summaryTitles } from "../support/my-polls-component-fixture.mjs";
import { navigationOrigin, navigationOwners } from "../support/organiser-navigation-fixture.mjs";

const request = (filter = "active", identity = navigationOwners.olivia, path = "/api/organiser/polls") => ({
  url: `${navigationOrigin}${path}?filter=${filter}`, method: "GET", identity
});

test("component summary fixtures preserve safe fields, saved order and participants without responses", () => {
  const fixture = createSummaryFixture();
  const active = fixture.respond(request()).body.items;
  assert.deepEqual(active.map(({ title }) => title), [summaryTitles.draft, summaryTitles.open]);
  assert.deepEqual(active[0].proposedDates, []);
  assert.equal(active[0].participantCount, 0);
  assert.deepEqual(active[1].proposedDates, savedChoices);
  assert.equal(active[1].participantCount, 2);
  assert.equal(active[1].createdAt, "2026-10-03T23:30:00.000Z");
  assert.deepEqual(Object.keys(active[1]).sort(), ["id", "title", "status", "createdAt", "timeZone", "proposedDates", "participantCount"].sort());
  assert.equal(fixture.respond(request("closed")).body.items[0].status, "closed");
  assert.equal(fixture.requests.length, 2);
});

test("scripted component replies cannot bypass authentication and retain detail navigation", () => {
  const fixture = createSummaryFixture({ replies: [emptyPage] });
  assert.equal(fixture.respond(request("active", undefined)).status, 200); // default argument supplies Olivia
  const unauthenticated = { ...request(), identity: undefined };
  const guarded = createSummaryFixture({ replies: [emptyPage] });
  assert.equal(guarded.respond(unauthenticated).status, 401);
  const detail = guarded.respond(request("active", navigationOwners.olivia, "/api/organiser/polls/draft-1"));
  assert.equal(detail.body.title, summaryTitles.draft);
  assert.deepEqual(guarded.respond(request()), emptyPage);
  assert.equal(guarded.requests.length, 3);
});

test("unscripted summaries remain owner scoped and fixtures do not share mutable records", () => {
  const first = createSummaryFixture();
  const second = createSummaryFixture();
  const sam = first.respond(request("active", navigationOwners.sam)).body.items;
  assert.deepEqual(sam.map(({ id }) => id), ["sam-1"]);
  first.records.get("open-1").proposedDates.reverse();
  assert.deepEqual(second.respond(request("open")).body.items[0].proposedDates, savedChoices);
  assert.equal(second.requests.length, 1);
});

test("scripted replies are sequenced, cloned, recorded and exhausted scripts fail loudly", async () => {
  const fixture = createSummaryFixture({ replies: [failedPage, emptyPage] });
  const failed = await fixture.respond(request("open"));
  failed.body.error.message = "mutated caller";
  assert.equal(failedPage.body.error.message, "Controlled failure");
  assert.deepEqual(await fixture.respond(request("open")), emptyPage);
  assert.throws(() => fixture.respond(request()), /script exhausted/);
  assert.throws(() => fixture.respond({ ...request(), url: `${navigationOrigin}/api/unconfigured` }), /Unconfigured component request/);
  assert.equal(fixture.requests.length, 4);
});

test("held replies stay pending until explicit release; disposal releases unfinished requests", async () => {
  const held = heldResponse(emptyPage);
  const fixture = createSummaryFixture({ replies: [held] });
  let settled = false;
  const pending = fixture.respond(request()).then((reply) => { settled = true; return reply; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(fixture.requests.length, 1);
  held.release();
  assert.deepEqual(await pending, emptyPage);
  assert.throws(() => held.release(), /released twice/);
  fixture.dispose();
  const abandoned = heldResponse(failedPage);
  const abandonedFixture = createSummaryFixture({ replies: [abandoned] });
  const unfinished = abandonedFixture.respond(request());
  abandonedFixture.dispose();
  assert.deepEqual(await unfinished, failedPage);
});
