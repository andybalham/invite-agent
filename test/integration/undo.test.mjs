import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const compositionUrl = pathToFileURL(path.join(root, "backend/dist/adapters/local/composition.js")).href;
const ownerHeaders = { "x-local-organiser-id": "local-organiser-undo-owner" };
const pollInput = {
  title: "Undo autumn dates",
  timeZone: "Europe/London",
  proposedDates: [
    { kind: "date", localDate: "2026-10-10" },
    { kind: "date", localDate: "2026-10-17" }
  ]
};

async function fixture(t, name) {
  const { createLocalComposition } = await import(compositionUrl);
  const suffix = `undo-${name}-${process.pid}-${Date.now()}`;
  const app = await createLocalComposition({
    appEnv: "test", authMode: "local", awsRegion: "eu-west-2",
    dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT ?? `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`,
    appTableName: `invite-agent-test-app-${suffix}`,
    auditTableName: `invite-agent-test-audit-${suffix}`,
    publicBaseUrl: "http://127.0.0.1:15173", publicTokenHashKey: "undo-test-key"
  });
  t.after(() => app.dispose());
  await app.initializeTables();
  return app;
}

async function createAndPublish(app) {
  const created = await app.http.handle({ method: "POST", path: "/api/organiser/polls", headers: ownerHeaders, body: pollInput });
  const published = await app.http.handle({ method: "POST", path: `/api/organiser/polls/${created.body.id}/publish`, headers: ownerHeaders });
  return { pollId: created.body.id, token: published.body.publicUrl.split("/").at(-1) };
}

async function previewAndUndo(app, pollId, eventId) {
  const preview = await app.http.handle({
    method: "POST", path: `/api/organiser/polls/${pollId}/history/${eventId}/undo-preview`, headers: ownerHeaders
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.eventId, eventId);
  assert.equal(preview.body.requiresConfirmation, true);
  assert.equal(preview.body.wouldOverwrite, false);
  const undone = await app.http.handle({
    method: "POST", path: `/api/organiser/polls/${pollId}/history/${eventId}/undo`, headers: ownerHeaders,
    body: { confirmed: true }
  });
  assert.equal(undone.status, 200);
  return undone.body;
}

test("preview then undo update restores state and recalculates totals/ranking with one linked UNDO event", async (t) => {
  const app = await fixture(t, "update");
  const { pollId, token } = await createAndPublish(app);
  const collection = `/api/public/polls/${token}/participants`;
  const added = await app.http.handle({ method: "POST", path: collection, headers: {}, body: { displayName: "Alice" } });
  const participant = added.body.participants[0];
  const secondDate = added.body.proposedDates[1].id;
  await app.http.handle({ method: "PUT", path: `${collection}/${participant.id}`, headers: {}, body: { dateId: secondDate, availability: "yes" } });
  const original = (await app.repository.listAuditEvents(pollId)).at(-1);
  const originalSnapshot = structuredClone(original);

  const result = await previewAndUndo(app, pollId, original.id);
  assert.equal(result.poll.participants[0].availability[secondDate], "no");
  assert.equal(result.poll.ranking.find(({ choiceId }) => choiceId === secondDate).yesTotal, 0);
  assert.equal(result.poll.ranking[0].choiceId, added.body.proposedDates[0].id, "tie returns to original date order");
  const events = await app.repository.listAuditEvents(pollId);
  assert.deepEqual(events.find(({ id }) => id === original.id), originalSnapshot, "original event remains immutable");
  const undoEvents = events.filter(({ action, undoOfEventId }) => action === "UNDO" && undoOfEventId === original.id);
  assert.equal(undoEvents.length, 1);
  assert.ok(undoEvents[0].revision > original.revision);
  assert.deepEqual(undoEvents[0].before, original.after);
  assert.deepEqual(undoEvents[0].after, original.before);

  const duplicate = await app.http.handle({ method: "POST", path: `/api/organiser/polls/${pollId}/history/${original.id}/undo`, headers: ownerHeaders, body: { confirmed: true } });
  assert.equal(duplicate.status, 409);
  assert.equal((await app.repository.listAuditEvents(pollId)).filter(({ action }) => action === "UNDO").length, 1);
});

test("participant add and delete inversions restore exact public rows and append one event apiece", async (t) => {
  const app = await fixture(t, "add-delete");
  const { pollId, token } = await createAndPublish(app);
  const collection = `/api/public/polls/${token}/participants`;
  const added = await app.http.handle({ method: "POST", path: collection, headers: {}, body: { displayName: "Alice" } });
  const participant = added.body.participants[0];
  const addEvent = (await app.repository.listAuditEvents(pollId)).at(-1);
  const afterAddUndo = await previewAndUndo(app, pollId, addEvent.id);
  assert.deepEqual(afterAddUndo.poll.participants, []);

  const bob = await app.http.handle({ method: "POST", path: collection, headers: {}, body: { displayName: "Bob" } });
  const bobRow = bob.body.participants[0];
  await app.http.handle({ method: "PUT", path: `${collection}/${bobRow.id}`, headers: {}, body: { dateId: bob.body.proposedDates[0].id, availability: "yes" } });
  const beforeDelete = (await app.http.handle({ method: "GET", path: `/api/public/polls/${token}`, headers: {} })).body.participants[0];
  await app.http.handle({ method: "DELETE", path: `${collection}/${bobRow.id}`, headers: {}, body: { confirmation: "Bob" } });
  const deleteEvent = (await app.repository.listAuditEvents(pollId)).at(-1);
  const afterDeleteUndo = await previewAndUndo(app, pollId, deleteEvent.id);
  assert.deepEqual(afterDeleteUndo.poll.participants, [beforeDelete]);
  assert.equal(afterDeleteUndo.poll.ranking[0].yesTotal, 1);
});

test("participant rename inversion restores the prior normalized name without changing answers", async (t) => {
  const app = await fixture(t, "rename");
  const { pollId, token } = await createAndPublish(app);
  const collection = `/api/public/polls/${token}/participants`;
  const added = await app.http.handle({ method: "POST", path: collection, headers: {}, body: { displayName: "Alice" } });
  const participant = added.body.participants[0];
  const item = `${collection}/${participant.id}`;
  await app.http.handle({ method: "PUT", path: item, headers: {}, body: { dateId: added.body.proposedDates[0].id, availability: "yes" } });
  const renamed = await app.http.handle({ method: "PUT", path: item, headers: {}, body: { displayName: "Alice Smith" } });
  const renameEvent = (await app.repository.listAuditEvents(pollId)).at(-1);
  const result = await previewAndUndo(app, pollId, renameEvent.id);
  assert.equal(result.poll.participants[0].displayName, "Alice");
  assert.deepEqual(result.poll.participants[0].availability, renamed.body.participants[0].availability);
});

test("undo requires owner authentication and confirmation and handles stale concurrent execution atomically", async (t) => {
  const app = await fixture(t, "guards");
  const { pollId, token } = await createAndPublish(app);
  const collection = `/api/public/polls/${token}/participants`;
  await app.http.handle({ method: "POST", path: collection, headers: {}, body: { displayName: "Alice" } });
  const event = (await app.repository.listAuditEvents(pollId)).at(-1);
  for (const request of [
    { headers: {}, body: { confirmed: true }, status: 401 },
    { headers: { "x-local-organiser-id": "local-organiser-undo-other" }, body: { confirmed: true }, status: 403 },
    { headers: ownerHeaders, body: { confirmed: false }, status: 400 }
  ]) {
    const response = await app.http.handle({ method: "POST", path: `/api/organiser/polls/${pollId}/history/${event.id}/undo`, headers: request.headers, body: request.body });
    assert.equal(response.status, request.status);
  }
  const [first, second] = await Promise.all([
    app.http.handle({ method: "POST", path: `/api/organiser/polls/${pollId}/history/${event.id}/undo`, headers: ownerHeaders, body: { confirmed: true } }),
    app.http.handle({ method: "POST", path: `/api/organiser/polls/${pollId}/history/${event.id}/undo`, headers: ownerHeaders, body: { confirmed: true } })
  ]);
  assert.deepEqual([first.status, second.status].sort(), [200, 409]);
  assert.equal((await app.repository.listAuditEvents(pollId)).filter(({ action }) => action === "UNDO").length, 1);
});

test("overlap preview warns, unrelated later work is ignored, and confirmation overwrites exactly with ranking recalculation", async (t) => {
  const app = await fixture(t, "overlap");
  const { pollId, token } = await createAndPublish(app);
  const collection = `/api/public/polls/${token}/participants`;
  const added = await app.http.handle({ method: "POST", path: collection, headers: {}, body: { displayName: "Alice" } });
  const alice = added.body.participants[0];
  const [firstDate, secondDate] = added.body.proposedDates.map(({ id }) => id);
  const item = `${collection}/${alice.id}`;
  await app.http.handle({ method: "PUT", path: item, headers: {}, body: { dateId: firstDate, availability: "yes" } });
  const selected = (await app.repository.listAuditEvents(pollId)).at(-1);
  await app.http.handle({ method: "PUT", path: item, headers: {}, body: { dateId: secondDate, availability: "yes" } });

  const unrelatedPreview = await app.http.handle({
    method: "POST", path: `/api/organiser/polls/${pollId}/history/${selected.id}/undo-preview`, headers: ownerHeaders
  });
  assert.equal(unrelatedPreview.status, 200);
  assert.equal(unrelatedPreview.body.wouldOverwrite, false);

  await app.http.handle({ method: "PUT", path: item, headers: {}, body: { dateId: firstDate, availability: "no" } });
  const beforePreviewEvents = await app.repository.listAuditEvents(pollId);
  const overlapPreview = await app.http.handle({
    method: "POST", path: `/api/organiser/polls/${pollId}/history/${selected.id}/undo-preview`, headers: ownerHeaders
  });
  assert.equal(overlapPreview.status, 200);
  assert.equal(overlapPreview.body.wouldOverwrite, true);
  assert.match(overlapPreview.body.warning, /later change.*overwrit/i);
  assert.deepEqual(await app.repository.listAuditEvents(pollId), beforePreviewEvents, "preview/cancellation changes nothing");

  const undone = await app.http.handle({
    method: "POST", path: `/api/organiser/polls/${pollId}/history/${selected.id}/undo`, headers: ownerHeaders,
    body: { confirmed: true }
  });
  assert.equal(undone.status, 200);
  assert.equal(undone.body.poll.participants[0].availability[firstDate], "no");
  assert.equal(undone.body.poll.participants[0].availability[secondDate], "yes", "unrelated later work is preserved");
  assert.equal(undone.body.poll.ranking[0].choiceId, secondDate, "derived ranking is recalculated");
  const events = await app.repository.listAuditEvents(pollId);
  assert.equal(events.length, beforePreviewEvents.length + 1);
  assert.deepEqual(events.at(-1).before, { value: "no" }, "audit records the real overwritten current value");
  assert.deepEqual(events.at(-1).after, selected.before, "audit records the documented prior value");
});

test("structurally invalid rename undo is rejected atomically without a compensating audit event", async (t) => {
  const app = await fixture(t, "invalid-structure");
  const { pollId, token } = await createAndPublish(app);
  const collection = `/api/public/polls/${token}/participants`;
  const aliceResponse = await app.http.handle({ method: "POST", path: collection, headers: {}, body: { displayName: "Alice" } });
  const alice = aliceResponse.body.participants[0];
  await app.http.handle({ method: "PUT", path: `${collection}/${alice.id}`, headers: {}, body: { displayName: "Alicia" } });
  const renameEvent = (await app.repository.listAuditEvents(pollId)).at(-1);
  await app.http.handle({ method: "POST", path: collection, headers: {}, body: { displayName: "Alice" } });
  const before = await app.repository.listAuditEvents(pollId);

  const preview = await app.http.handle({
    method: "POST", path: `/api/organiser/polls/${pollId}/history/${renameEvent.id}/undo-preview`, headers: ownerHeaders
  });
  assert.equal(preview.status, 409);
  assert.match(preview.body.error.message, /already named.*Alice|name.*clash/i);
  assert.deepEqual(await app.repository.listAuditEvents(pollId), before);

  const rejected = await app.http.handle({
    method: "POST", path: `/api/organiser/polls/${pollId}/history/${renameEvent.id}/undo`, headers: ownerHeaders,
    body: { confirmed: true }
  });
  assert.equal(rejected.status, 409);
  assert.deepEqual(await app.repository.listAuditEvents(pollId), before, "no partial mutation or audit event is written");
  const publicPoll = await app.http.handle({ method: "GET", path: `/api/public/polls/${token}`, headers: {} });
  assert.deepEqual(publicPoll.body.participants.map(({ displayName }) => displayName).sort(), ["Alice", "Alicia"]);
});
