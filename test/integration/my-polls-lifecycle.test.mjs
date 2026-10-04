import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createLocalComposition } from "../../backend/dist/adapters/local/composition.js";
import { createLocalNodeServer } from "../../backend/dist/adapters/local/node-server.js";
import { ownedPollListResponseSchema } from "../../packages/contracts/dist/index.js";
import { createIntegrationApp } from "../support/integration-fixture.mjs";
import { dashboardSnapshot } from "../support/my-polls-fixture.mjs";

const collection = "/api/organiser/polls";
const owner = "local-organiser-lifecycle-owner";
const foreignOwner = "local-organiser-lifecycle-other";
const ownerHeaders = { "x-local-organiser-id": owner };
const dateInputs = [
  { kind: "date", localDate: "2026-10-10" },
  { kind: "date-time", localDateTime: "2026-10-25T01:30", utcOffset: "+00:00" }
];
const savedDates = [dateInputs[0], { ...dateInputs[1], timeZone: "Europe/London", utcInstant: "2026-10-25T01:30:00.000Z" }];
const details = (title, proposedDates = dateInputs) => ({ title, timeZone: "Europe/London", proposedDates });
const management = (poll) => `${collection}/${poll.id}`;
const participants = (published) => `/api/public/polls/${published.publicUrl.split("/").at(-1)}/participants`;
const byRevision = (events) => events.toSorted((a, b) => a.revision - b.revision);

async function fixture(t) {
  let server;
  const app = await createIntegrationApp(t, createLocalComposition, {
    appEnv: "test", authMode: "local", awsRegion: "eu-west-2",
    dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT ?? `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`,
    publicBaseUrl: "http://127.0.0.1:15173", publicTokenHashKey: "lifecycle-integration-key",
    dashboardCursorSecret: "lifecycle-integration-cursor-secret"
  }, { beforeCleanup: [async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }] });
  server = createLocalNodeServer(app.http);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const expected = new Map();
  const audits = new Map();

  async function request(method, path, body, headers = ownerHeaders) {
    const response = await fetch(`${baseUrl}${path}`, {
      method, headers: { ...headers, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }

  // Explicit lifecycle answers, independent of the production query/projection helpers.
  async function summaries() {
    const before = await dashboardSnapshot(app);
    for (const { item, table } of before.filter(({ item }) => item.SK.S === "METADATA")) {
      assert.equal(table, app.config.appTableName);
      const document = JSON.parse(item.document.S);
      const summary = expected.get(document.id);
      assert.ok(summary, "every persisted poll is accounted for");
      for (const [key, value] of Object.entries(summary)) {
        assert.deepEqual(document[key], key === "proposedDates" && value.length ? savedDates : value, `stored ${key}`);
      }
      const events = audits.get(document.id);
      assert.equal(document.version, events.length);
      assert.equal(item.version.N, String(events.length));
      assert.equal(item.status.S, summary.status);
      assert.equal(item.participantCount.N, String(summary.participantCount));
      assert.equal(item.GSI1PK.S, `ORGANISER#${document.organiserId}`);
      assert.equal(item.GSI1SK.S, `POLL#${summary.createdAt}#${summary.id}`, "creation index never follows activity time");
      assert.equal((await app.repository.listParticipants(summary.id)).length, summary.participantCount);
      assert.deepEqual(byRevision(await app.repository.listAuditEvents(summary.id)), events);
    }
    const owned = [...expected.values()].filter((poll) => audits.get(poll.id)[0].actorId === owner).reverse();
    const target = owned.at(-1);
    const searches = [
      { search: "", matches: owned },
      { search: target.title, matches: [target] },
      { search: "No matching lifecycle title", matches: [] }
    ];
    for (let repeat = 0; repeat < 2; repeat += 1) {
      for (const [filter, statuses] of [
        ["active", ["draft", "open"]], ["draft", ["draft"]], ["open", ["open"]], ["closed", ["closed"]]
      ]) {
        for (const { search, matches } of searches) {
          const items = [];
          const cursors = new Set();
          let cursor;
          do {
            const query = new URLSearchParams({ filter, search, pageSize: "1", ...(cursor ? { cursor } : {}) });
            const response = await request("GET", `${collection}?${query}`);
            assert.equal(response.status, 200);
            assert.equal(response.headers.get("cache-control"), "private, no-store");
            assert.ok(ownedPollListResponseSchema.safeParse(response.body).success);
            items.push(...response.body.items);
            cursor = response.body.nextCursor;
            if (cursor) {
              assert.ok(!cursors.has(cursor), "continuation advances");
              cursors.add(cursor);
              assert.ok(cursors.size <= expected.size, "bounded traversal");
            }
          } while (cursor);
          assert.deepEqual(items, matches.filter((poll) => statuses.includes(poll.status)), `${target.status}: ${filter}/${search}`);
          assert.equal(new Set(items.map(({ id }) => id)).size, items.length);
        }
      }
    }
    assert.deepEqual(await dashboardSnapshot(app), before, "repeated list/search/filter/continuation reads change no rows or audit revisions");
  }

  async function create(title, inputDates = [], organiserId = owner) {
    const response = await request("POST", collection, details(title, inputDates), { "x-local-organiser-id": organiserId });
    assert.equal(response.status, 201);
    const { id } = response.body;
    const { createdAt } = await app.repository.getPoll(id);
    const previous = [...expected.values()].at(-1);
    if (previous) assert.ok(createdAt > previous.createdAt, "fixtures have distinct, increasing API creation instants");
    const summary = { id, title, status: "draft", createdAt, timeZone: "Europe/London",
      proposedDates: inputDates, participantCount: 0 };
    expected.set(id, summary);
    const events = byRevision(await app.repository.listAuditEvents(id));
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "POLL_CREATED");
    assert.equal(events[0].revision, 1);
    assert.equal(events[0].actorId, organiserId);
    assert.equal(events[0].occurredAt, createdAt);
    audits.set(id, events);
    await summaries();
    return summary;
  }

  async function mutate(poll, action, method, path, body, changes = {}, headers = ownerHeaders) {
    const prior = audits.get(poll.id);
    const response = await request(method, path, body, headers);
    assert.equal(response.status, action === "PARTICIPANT_ADDED" ? 201 : 200, JSON.stringify(response.body));
    const events = byRevision(await app.repository.listAuditEvents(poll.id));
    assert.deepEqual(events.slice(0, -1), prior, "all previous audit events stay immutable");
    assert.equal(events.length, prior.length + 1, `${action} adds exactly one revision`);
    assert.deepEqual(events.map(({ revision }) => revision), Array.from({ length: events.length }, (_, index) => index + 1));
    const event = events.at(-1);
    assert.equal(event.action, action);
    assert.equal(event.actorCategory, headers === ownerHeaders ? "organiser" : "anonymous-link-holder");
    if (headers === ownerHeaders) assert.equal(event.actorId, owner);
    assert.ok(event.occurredAt > poll.createdAt, "mutation time differs from immutable creation time");
    audits.set(poll.id, events);
    Object.assign(poll, changes);
    await summaries();
    return { ...response.body, event };
  }

  async function reject(attempts) {
    const before = await dashboardSnapshot(app);
    for (const { method = "POST", path, body, headers = ownerHeaders, status, code } of attempts) {
      const response = await request(method, path, body, headers);
      assert.equal(response.status, status, path);
      assert.equal(response.body.error.code, code, path);
      assert.deepEqual(await dashboardSnapshot(app), before, `${path}: rejected write is atomically inert`);
    }
    await summaries();
  }

  return { app, request, create, mutate, reject, summaries };
}

// T-122 / MP-US-07–10: use saved API results, real HTTP and disposable DynamoDB Local tables.
test("T-122 saved lifecycle summaries retain dates/counts and creation order with exactly one revision per mutation", async (t) => {
  const { app, create, mutate } = await fixture(t);
  const older = await create("Older dinner");
  const draftPeer = await create("Newer draft dinner");
  const openPeer = await create("Newer open dinner", dateInputs);
  await mutate(openPeer, "POLL_PUBLISHED", "POST", `${management(openPeer)}/publish`, undefined, { status: "open" });
  const closedPeer = await create("Newer closed dinner", dateInputs);
  await mutate(closedPeer, "POLL_PUBLISHED", "POST", `${management(closedPeer)}/publish`, undefined, { status: "open" });
  await mutate(closedPeer, "POLL_CLOSED", "POST", `${management(closedPeer)}/close`,
    { selectedDateId: `${closedPeer.id}-date-1`, confirmed: true }, { status: "closed" });
  await create("Foreign dinner", dateInputs, foreignOwner);

  await mutate(older, "POLL_DETAILS_UPDATED", "PUT", management(older), details("Edited older dinner"),
    { title: "Edited older dinner", proposedDates: dateInputs });
  const published = await mutate(older, "POLL_PUBLISHED", "POST", `${management(older)}/publish`, undefined, { status: "open" });
  const rows = participants(published);
  const added = await mutate(older, "PARTICIPANT_ADDED", "POST", rows, { displayName: "Alice" }, { participantCount: 1 }, {});
  const alice = added.participants[0];
  const first = added.proposedDates[0].id;
  const second = added.proposedDates[1].id;
  await mutate(older, "PARTICIPANT_ADDED", "POST", rows, { displayName: "Bob" }, { participantCount: 2 }, {});
  await mutate(older, "PARTICIPANT_RENAMED", "PUT", `${rows}/${alice.id}`, { displayName: "Alicia" }, {}, {});
  const voted = await mutate(older, "AVAILABILITY_CHANGED", "PUT", `${rows}/${alice.id}`, { dateId: first, availability: "yes" }, {}, {});
  const closed = await mutate(older, "POLL_CLOSED", "POST", `${management(older)}/close`,
    { selectedDateId: second, confirmed: true }, { status: "closed" });
  assert.deepEqual(closed.event.before, { status: "open" });
  assert.deepEqual(closed.event.after, { status: "closed", selectedDateId: second, ranking: voted.ranking });
  assert.equal(closed.poll.selectedDateId, second, "selection and closing share the same single revision");
  assert.deepEqual((await app.repository.getPoll(older.id)).frozenRanking, voted.ranking);

  const reopened = await mutate(older, "POLL_REOPENED", "POST", `${management(older)}/reopen`, { confirmed: true }, { status: "open" });
  assert.deepEqual(reopened.event.before, closed.event.after);
  assert.deepEqual(reopened.event.after, { status: "open", selectedDateId: second, provisional: true });
  assert.equal(reopened.event.revision, closed.event.revision + 1, "reopening has its own revision");
  assert.equal(reopened.poll.provisional, true);
  assert.equal((await app.repository.getPoll(older.id)).frozenRanking, undefined);
  const bob = reopened.poll.participants.find(({ displayName }) => displayName === "Bob");
  await mutate(older, "PARTICIPANT_DELETED", "DELETE", `${rows}/${bob.id}`, { confirmation: "Bob" }, { participantCount: 1 }, {});
  await mutate(older, "AVAILABILITY_CHANGED", "PUT", `${rows}/${alice.id}`, { dateId: second, availability: "yes" }, {}, {});
  await mutate(older, "POLL_CLOSED", "POST", `${management(older)}/close`, { selectedDateId: first, confirmed: true }, { status: "closed" });
  assert.equal((await app.repository.getPoll(older.id)).provisional, undefined);
  assert.equal((await app.repository.getPoll(draftPeer.id)).version, 1, "other polls gain no dashboard revisions");
});

test("T-122 rejected lifecycle and closed-state writes leave summaries, projections and audit unchanged", async (t) => {
  const { create, mutate, reject } = await fixture(t);
  const poll = await create("Restricted dinner", dateInputs);
  const path = management(poll);
  const first = `${poll.id}-date-1`;
  const closeBody = { selectedDateId: first, confirmed: true };

  async function deniedLifecycle(operation, body, publicPath) {
    await reject([
      { path: `${path}/${operation}`, body, headers: { "x-local-organiser-id": foreignOwner }, status: 403, code: "FORBIDDEN" },
      { path: `${path}/${operation}`, body, headers: {}, status: 401, code: "UNAUTHENTICATED" },
      { path: `${path}/${operation}`, body, headers: { authorization: `Bearer ${publicPath.split("/").at(-1)}` }, status: 401, code: "UNAUTHENTICATED" },
      { path: `${publicPath}/${operation}`, body, headers: {}, status: 404, code: "NOT_FOUND" }
    ]);
  }

  await deniedLifecycle("publish", undefined, `/api/public/polls/${poll.id}`);
  const published = await mutate(poll, "POLL_PUBLISHED", "POST", `${path}/publish`, undefined, { status: "open" });
  const rows = participants(published);
  const publicPath = rows.slice(0, -"/participants".length);
  const added = await mutate(poll, "PARTICIPANT_ADDED", "POST", rows, { displayName: "Alice" }, { participantCount: 1 }, {});
  const alice = added.participants[0];
  await deniedLifecycle("close", closeBody, publicPath);
  await reject([{ path: `${path}/close`, body: { ...closeBody, confirmed: false }, status: 400, code: "VALIDATION_ERROR" }]);
  await mutate(poll, "POLL_CLOSED", "POST", `${path}/close`, closeBody, { status: "closed" });
  await deniedLifecycle("reopen", { confirmed: true }, publicPath);
  await reject([
    { path: `${path}/close`, body: closeBody, status: 409, code: "CONFLICT" },
    { path: `${path}/reopen`, body: { confirmed: false }, status: 400, code: "VALIDATION_ERROR" },
    { path: rows, body: { displayName: "Bob" }, headers: {}, status: 422, code: "INVALID_LIFECYCLE" },
    { method: "PUT", path: `${rows}/${alice.id}`, body: { displayName: "Alicia" }, headers: {}, status: 422, code: "INVALID_LIFECYCLE" },
    { method: "PUT", path: `${rows}/${alice.id}`, body: { dateId: first, availability: "yes" }, headers: {}, status: 422, code: "INVALID_LIFECYCLE" },
    { method: "DELETE", path: `${rows}/${alice.id}`, body: { confirmation: "Alice" }, headers: {}, status: 422, code: "INVALID_LIFECYCLE" },
    { path: `${path}/history/${added.event.id}/undo`, body: { confirmed: true }, status: 422, code: "INVALID_LIFECYCLE" },
    ...[
      [...dateInputs, { kind: "date", localDate: "2026-11-01" }],
      [{ kind: "date", localDate: "2026-10-11" }, dateInputs[1]],
      [...dateInputs].reverse(), [dateInputs[0]]
    ].map((dates) => ({ method: "PUT", path, body: details(poll.title, dates), status: 422, code: "INVALID_LIFECYCLE" }))
  ]);
  // Closed location maintenance remains allowed and does not unlock response/date writes.
  await mutate(poll, "LOCATION_CHANGED", "PUT", `${path}/location`, { location: "Village hall" });
  await reject([{ method: "PUT", path: `${rows}/${alice.id}`, body: { dateId: first, availability: "yes" },
    headers: {}, status: 422, code: "INVALID_LIFECYCLE" }]);
  await mutate(poll, "POLL_REOPENED", "POST", `${path}/reopen`, { confirmed: true }, { status: "open" });
  await reject([{ path: `${path}/reopen`, body: { confirmed: true }, status: 409, code: "CONFLICT" }]);
});

test("T-122 participant mutations and every undo inversion keep stored summary counts accurate without dashboard revisions", async (t) => {
  const { app, create, mutate, request, reject } = await fixture(t);
  const poll = await create("Undo dinner", dateInputs);
  const published = await mutate(poll, "POLL_PUBLISHED", "POST", `${management(poll)}/publish`, undefined, { status: "open" });
  const rows = participants(published);
  const added = await mutate(poll, "PARTICIPANT_ADDED", "POST", rows, { displayName: "Alice" }, { participantCount: 1 }, {});
  const alice = added.participants[0];
  const item = `${rows}/${alice.id}`;

  async function undo(event, count) {
    const path = `${management(poll)}/history/${event.id}`;
    const before = await dashboardSnapshot(app);
    const preview = await request("POST", `${path}/undo-preview`);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.eventId, event.id);
    assert.equal(preview.body.requiresConfirmation, true);
    assert.deepEqual(await dashboardSnapshot(app), before, "undo preview is read-only");
    const result = await mutate(poll, "UNDO", "POST", `${path}/undo`, { confirmed: true }, { participantCount: count });
    assert.equal(result.event.undoOfEventId, event.id);
    assert.equal(result.event.undoOfRevision, event.revision);
    return result.poll;
  }

  const renamed = await mutate(poll, "PARTICIPANT_RENAMED", "PUT", item, { displayName: "Alicia" }, {}, {});
  assert.equal((await undo(renamed.event, 1)).participants[0].displayName, "Alice");
  const vote = await mutate(poll, "AVAILABILITY_CHANGED", "PUT", item,
    { dateId: added.proposedDates[0].id, availability: "yes" }, {}, {});
  assert.equal((await undo(vote.event, 1)).participants[0].availability[added.proposedDates[0].id], "no");
  const beforeDelete = await request("GET", rows.slice(0, -"/participants".length), undefined, {});
  assert.equal(beforeDelete.status, 200);
  const deleted = await mutate(poll, "PARTICIPANT_DELETED", "DELETE", item, { confirmation: "Alice" }, { participantCount: 0 }, {});
  const restored = await undo(deleted.event, 1);
  assert.deepEqual(restored.participants, beforeDelete.body.participants, "delete undo restores participant identities, names and answers");
  assert.deepEqual((await undo(added.event, 0)).participants, []);
  await reject([{ path: `${management(poll)}/history/${added.event.id}/undo`, body: { confirmed: true }, status: 409, code: "CONFLICT" }]);
  await mutate(poll, "PARTICIPANT_ADDED", "POST", rows, { displayName: "Alice" }, { participantCount: 1 }, {});
});
