import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const compositionUrl = pathToFileURL(path.join(root, "backend/dist/adapters/local/composition.js")).href;
const ownerHeaders = { "x-local-organiser-id": "local-organiser-audit-owner" };
const otherHeaders = { "x-local-organiser-id": "local-organiser-audit-other" };
const pollInput = {
  title: "Protected autumn history",
  timeZone: "Europe/London",
  proposedDates: [
    { kind: "date", localDate: "2026-10-10" },
    { kind: "date", localDate: "2026-10-17" }
  ]
};

async function fixture(t) {
  const { createLocalComposition } = await import(compositionUrl);
  const suffix = `audit-auth-${process.pid}-${Date.now()}`;
  const app = await createLocalComposition({
    appEnv: "test",
    authMode: "local",
    awsRegion: "eu-west-2",
    dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT ?? `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`,
    appTableName: `invite-agent-test-app-${suffix}`,
    auditTableName: `invite-agent-test-audit-${suffix}`,
    publicBaseUrl: "http://127.0.0.1:15173",
    publicTokenHashKey: "audit-authorization-test-key"
  });
  t.after(() => app.dispose());
  await app.initializeTables();
  return app;
}

async function protectedPoll(app) {
  const created = await app.http.handle({
    method: "POST",
    path: "/api/organiser/polls",
    headers: ownerHeaders,
    body: pollInput
  });
  const published = await app.http.handle({
    method: "POST",
    path: `/api/organiser/polls/${created.body.id}/publish`,
    headers: ownerHeaders
  });
  const token = published.body.publicUrl.split("/").at(-1);
  await app.http.handle({
    method: "POST",
    path: `/api/public/polls/${token}/participants`,
    headers: {},
    body: { displayName: "Confidential Alice" }
  });
  const events = await app.repository.listAuditEvents(created.body.id);
  return { pollId: created.body.id, token, event: events.at(-1) };
}

function assertNonDisclosing(response, expectedStatus, secrets) {
  assert.equal(response.status, expectedStatus);
  const serialized = JSON.stringify(response.body);
  for (const secret of secrets) {
    assert.equal(serialized.includes(secret), false, `rejection disclosed ${secret}`);
  }
  assert.deepEqual(
    Object.keys(response.body.error).sort(),
    ["code", "message"],
    "authorization failures expose only the stable public error shape"
  );
}

test("history, undo preview, and undo reject link holders with 401 and non-owners with 403 without disclosure or mutation", async (t) => {
  const app = await fixture(t);
  const { pollId, token, event } = await protectedPoll(app);
  const routes = [
    { method: "GET", path: `/api/organiser/polls/${pollId}/history` },
    { method: "POST", path: `/api/organiser/polls/${pollId}/history/${event.id}/undo-preview` },
    {
      method: "POST",
      path: `/api/organiser/polls/${pollId}/history/${event.id}/undo`,
      body: { confirmed: true }
    }
  ];
  const beforePoll = await app.repository.getPoll(pollId);
  const beforeParticipants = await app.repository.listParticipants(pollId);
  const beforeHistory = await app.repository.listAuditEvents(pollId);
  const secrets = [token, event.id, event.action, "Confidential Alice"];

  for (const route of routes) {
    const linkHolder = await app.http.handle({
      ...route,
      headers: {
        authorization: `Bearer ${token}`,
        "x-public-link-token": token
      }
    });
    assertNonDisclosing(linkHolder, 401, secrets);

    const nonOwner = await app.http.handle({ ...route, headers: otherHeaders });
    assertNonDisclosing(nonOwner, 403, secrets);

    assert.deepEqual(await app.repository.getPoll(pollId), beforePoll);
    assert.deepEqual(await app.repository.listParticipants(pollId), beforeParticipants);
    assert.deepEqual(await app.repository.listAuditEvents(pollId), beforeHistory);
  }
});

test("the owning organiser can read history, preview undo, and execute the confirmed undo", async (t) => {
  const app = await fixture(t);
  const { pollId, event } = await protectedPoll(app);

  const history = await app.http.handle({
    method: "GET",
    path: `/api/organiser/polls/${pollId}/history`,
    headers: ownerHeaders
  });
  assert.equal(history.status, 200);
  assert.equal(history.body.items.some(({ id }) => id === event.id), true);

  const preview = await app.http.handle({
    method: "POST",
    path: `/api/organiser/polls/${pollId}/history/${event.id}/undo-preview`,
    headers: ownerHeaders
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.eventId, event.id);

  const undo = await app.http.handle({
    method: "POST",
    path: `/api/organiser/polls/${pollId}/history/${event.id}/undo`,
    headers: ownerHeaders,
    body: { confirmed: true }
  });
  assert.equal(undo.status, 200);
  assert.equal(undo.body.poll.participants.length, 0);
  const events = await app.repository.listAuditEvents(pollId);
  assert.equal(events.length, history.body.total + 1);
  assert.equal(events.at(-1).undoOfEventId, event.id);
});
