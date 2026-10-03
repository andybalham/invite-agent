import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createIntegrationApp } from "../support/integration-fixture.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const compositionUrl = pathToFileURL(path.join(root, "backend/dist/adapters/local/composition.js")).href;
const ownerHeaders = { "x-local-organiser-id": "local-organiser-audit-owner" };
const otherHeaders = { "x-local-organiser-id": "local-organiser-audit-other" };
const pollInput = {
  title: "Audited autumn dates",
  description: "Initial description",
  location: "Community Hall",
  timeZone: "Europe/London",
  proposedDates: [
    { kind: "date", localDate: "2026-10-10" },
    { kind: "date-time", localDateTime: "2026-10-17T18:00" }
  ]
};

async function fixture(t, name) {
  const { createLocalComposition } = await import(compositionUrl);
  const suffix = `audit-${name}-${process.pid}-${Date.now()}`;
  const app = await createIntegrationApp(t, createLocalComposition, {
    appEnv: "test",
    authMode: "local",
    awsRegion: "eu-west-2",
    dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT ?? `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`,
    appTableName: `invite-agent-test-app-${suffix}`,
    auditTableName: `invite-agent-test-audit-${suffix}`,
    publicBaseUrl: "http://127.0.0.1:15173",
    publicTokenHashKey: "audit-history-test-key"
  });
  return app;
}

async function createAndPublish(app) {
  const created = await app.http.handle({ method: "POST", path: "/api/organiser/polls", headers: ownerHeaders, body: pollInput });
  assert.equal(created.status, 201);
  const published = await app.http.handle({ method: "POST", path: `/api/organiser/polls/${created.body.id}/publish`, headers: ownerHeaders });
  assert.equal(published.status, 200);
  return { pollId: created.body.id, token: published.body.publicUrl.split("/").at(-1) };
}

test("every successful poll, date, location, publication, participant, and availability mutation appends exactly one complete immutable event", async (t) => {
  const app = await fixture(t, "complete");
  const { pollId, token } = await createAndPublish(app);
  const count = async () => (await app.repository.listAuditEvents(pollId)).length;
  assert.equal(await count(), 2);

  const updatedInput = {
    ...pollInput,
    title: "Updated audited dates",
    location: "Riverside Room",
    proposedDates: [...pollInput.proposedDates, { kind: "date", localDate: "2026-10-24" }]
  };
  const updated = await app.http.handle({ method: "PUT", path: `/api/organiser/polls/${pollId}`, headers: ownerHeaders, body: updatedInput });
  assert.equal(updated.status, 200);
  assert.equal(await count(), 3);

  const collection = `/api/public/polls/${token}/participants`;
  const added = await app.http.handle({ method: "POST", path: collection, headers: {}, body: { displayName: "Alice" } });
  assert.equal(added.status, 201);
  assert.equal(await count(), 4);
  const participant = added.body.participants[0];
  const item = `${collection}/${participant.id}`;
  const renamed = await app.http.handle({ method: "PUT", path: item, headers: {}, body: { displayName: "Alice Smith" } });
  assert.equal(renamed.status, 200);
  assert.equal(await count(), 5);
  const changed = await app.http.handle({ method: "PUT", path: item, headers: {}, body: { dateId: added.body.proposedDates[0].id, availability: "yes" } });
  assert.equal(changed.status, 200);
  assert.equal(await count(), 6);
  const removed = await app.http.handle({ method: "DELETE", path: item, headers: {}, body: { confirmation: "Alice Smith" } });
  assert.equal(removed.status, 200);
  assert.equal(await count(), 7);

  const events = await app.repository.listAuditEvents(pollId);
  assert.deepEqual(events.map(({ action }) => action), [
    "POLL_CREATED", "POLL_PUBLISHED", "POLL_DETAILS_UPDATED", "PARTICIPANT_ADDED",
    "PARTICIPANT_RENAMED", "AVAILABILITY_CHANGED", "PARTICIPANT_DELETED"
  ]);
  for (const [index, event] of events.entries()) {
    assert.equal(event.pollId, pollId);
    assert.equal(event.revision, index + 1);
    assert.ok(event.entityType);
    assert.ok(event.entityId);
    assert.ok(event.before !== undefined);
    assert.ok(event.after !== undefined);
    assert.match(event.occurredAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(["organiser", "anonymous-link-holder"].includes(event.actorCategory));
    if (event.actorCategory === "organiser") assert.equal(event.actorId, "local-organiser-audit-owner");
    else assert.equal(event.actorId, "anonymous");
    assert.ok(Object.isFrozen(event), "returned audit events are immutable values");
  }
});

test("owner history is paged newest first, meaningful, authorized, and redacted", async (t) => {
  const app = await fixture(t, "history");
  const { pollId, token } = await createAndPublish(app);
  await app.http.handle({ method: "POST", path: `/api/public/polls/${token}/participants`, headers: {}, body: { displayName: "Alice" } });

  const first = await app.http.handle({
    method: "GET", path: `/api/organiser/polls/${pollId}/history`, headers: { ...ownerHeaders, "x-audit-page-size": "2" }
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.items.length, 2);
  assert.equal(first.body.total, 3);
  assert.ok(first.body.nextCursor);
  assert.ok(first.body.items[0].revision > first.body.items[1].revision);
  assert.deepEqual(first.body.items[0].actor, { category: "anonymous-link-holder" });
  assert.match(first.body.items[0].summary, /Alice|participant/i);

  const second = await app.http.handle({
    method: "GET", path: `/api/organiser/polls/${pollId}/history`, headers: { ...ownerHeaders, "x-audit-page-size": "2", "x-audit-cursor": first.body.nextCursor }
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.items.length, 1);
  assert.equal(second.body.nextCursor, undefined);
  assert.deepEqual(new Set([...first.body.items, ...second.body.items].map(({ id }) => id)).size, 3);

  for (const headers of [{}, { authorization: `Bearer ${token}` }, otherHeaders]) {
    const rejected = await app.http.handle({ method: "GET", path: `/api/organiser/polls/${pollId}/history`, headers });
    assert.ok([401, 403].includes(rejected.status));
  }
  const serialized = JSON.stringify([first.body, second.body]);
  for (const forbidden of [token, "authorization", "cookie", "session", "publicTokenHash", "requestBody"]) {
    assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false, `history leaked ${forbidden}`);
  }
});

test("rejected, unauthorized, and concurrent writes do not create phantom or duplicate events", async (t) => {
  const app = await fixture(t, "rejected");
  const { pollId, token } = await createAndPublish(app);
  const collection = `/api/public/polls/${token}/participants`;
  const added = await app.http.handle({ method: "POST", path: collection, headers: {}, body: { displayName: "Alice" } });
  const participant = added.body.participants[0];
  const before = await app.repository.listAuditEvents(pollId);
  const rejected = await app.http.handle({
    method: "POST", path: collection,
    headers: { cookie: "sid=super-secret", authorization: "Bearer secret" },
    body: { displayName: "Alice", sessionId: "super-secret", credentials: { password: "super-secret" } }
  });
  assert.equal(rejected.status, 400);
  const unauthorized = await app.http.handle({ method: "PUT", path: `/api/organiser/polls/${pollId}`, headers: otherHeaders, body: pollInput });
  assert.equal(unauthorized.status, 403);
  assert.deepEqual(await app.repository.listAuditEvents(pollId), before);

  const item = `${collection}/${participant.id}`;
  const dateId = added.body.proposedDates[0].id;
  const results = await Promise.all([
    app.http.handle({ method: "PUT", path: item, headers: {}, body: { dateId, availability: "yes" } }),
    app.http.handle({ method: "PUT", path: item, headers: {}, body: { dateId, availability: "no" } })
  ]);
  assert.deepEqual(results.map(({ status }) => status), [200, 200]);
  const after = await app.repository.listAuditEvents(pollId);
  assert.equal(after.length, before.length + 2);
  assert.equal(after.filter(({ action }) => action === "AVAILABILITY_CHANGED").length, 2);
  const serialized = JSON.stringify(after);
  assert.equal(serialized.includes("super-secret"), false);
});
