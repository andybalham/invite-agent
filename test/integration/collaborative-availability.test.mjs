import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createIntegrationApp } from "../support/integration-fixture.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const compositionUrl = pathToFileURL(path.join(root, "backend/dist/adapters/local/composition.js")).href;
const suffix = `collaboration-${process.pid}-${Date.now()}`;
const config = {
  appEnv: "test",
  authMode: "local",
  awsRegion: "eu-west-2",
  dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT ?? `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`,
  appTableName: `invite-agent-test-app-${suffix}`,
  auditTableName: `invite-agent-test-audit-${suffix}`,
  publicBaseUrl: "http://127.0.0.1:15173",
  publicTokenHashKey: "collaboration-test-token-key"
};
const headers = { "x-local-organiser-id": "local-organiser-collaboration" };
const pollInput = {
  title: "Shared autumn dates",
  timeZone: "Europe/London",
  proposedDates: [
    { kind: "date", localDate: "2026-10-10" },
    { kind: "date-time", localDateTime: "2026-10-17T18:00" }
  ]
};

async function fixture(t, suffixName) {
  const { createLocalComposition } = await import(compositionUrl);
  const app = await createIntegrationApp(t, createLocalComposition, {
    ...config,
    appTableName: `${config.appTableName}-${suffixName}`,
    auditTableName: `${config.auditTableName}-${suffixName}`
  });
  const created = await app.http.handle({ method: "POST", path: "/api/organiser/polls", headers, body: pollInput });
  const published = await app.http.handle({ method: "POST", path: `/api/organiser/polls/${created.body.id}/publish`, headers });
  const token = published.body.publicUrl.split("/").at(-1);
  return { app, pollId: created.body.id, token };
}

test("public link holders add a unique trimmed participant with default-No answers", async (t) => {
  const { app, pollId, token } = await fixture(t, "add");
  const path = `/api/public/polls/${token}/participants`;
  const created = await app.http.handle({ method: "POST", path, headers: {}, body: { displayName: "  Alice  Cooper  " } });
  assert.equal(created.status, 201);
  assert.equal(created.body.participants.length, 1);
  assert.equal(created.body.participants[0].displayName, "Alice  Cooper");
  assert.deepEqual(Object.values(created.body.participants[0].availability), ["no", "no"]);
  assert.equal((await app.repository.listAuditEvents(pollId)).at(-1).action, "PARTICIPANT_ADDED");

  for (const displayName of ["", "ＡＬＩＣＥ  COOPER", "😀".repeat(101)]) {
    const rejected = await app.http.handle({ method: "POST", path, headers: {}, body: { displayName } });
    assert.ok([400, 409].includes(rejected.status));
  }
  assert.equal((await app.repository.listAuditEvents(pollId)).length, 3);
});

test("invalid public capability and client-supplied availability create no participant or audit", async (t) => {
  const { app, pollId, token } = await fixture(t, "reject");
  const auditBefore = await app.repository.listAuditEvents(pollId);
  const invalid = await app.http.handle({
    method: "POST",
    path: `/api/public/polls/${"A".repeat(32)}/participants`,
    headers: {},
    body: { displayName: "Mallory" }
  });
  assert.equal(invalid.status, 404);
  const supplied = await app.http.handle({
    method: "POST",
    path: `/api/public/polls/${token}/participants`,
    headers: {},
    body: { displayName: "Mallory", availability: { anything: "maybe" } }
  });
  assert.equal(supplied.status, 400);
  assert.deepEqual(await app.repository.listAuditEvents(pollId), auditBefore);
});

test("any link holder can rename and exactly-confirm deletion without changing answers", async (t) => {
  const { app, pollId, token } = await fixture(t, "rename-delete");
  const collection = `/api/public/polls/${token}/participants`;
  const added = await app.http.handle({ method: "POST", path: collection, headers: {}, body: { displayName: "Alice" } });
  const participant = added.body.participants[0];
  const item = `${collection}/${participant.id}`;

  const renamed = await app.http.handle({ method: "PUT", path: item, headers: {}, body: { displayName: "  Alice Smith  " } });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.participants[0].displayName, "Alice Smith");
  assert.deepEqual(renamed.body.participants[0].availability, participant.availability);

  const mismatch = await app.http.handle({ method: "DELETE", path: item, headers: {}, body: { confirmation: "alice smith" } });
  assert.equal(mismatch.status, 400);
  assert.equal((await app.repository.listParticipants(pollId)).length, 1);

  const removed = await app.http.handle({ method: "DELETE", path: item, headers: {}, body: { confirmation: "Alice Smith" } });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.participants.length, 0);
  assert.deepEqual(
    (await app.repository.listAuditEvents(pollId)).map(({ action }) => action),
    ["POLL_CREATED", "POLL_PUBLISHED", "PARTICIPANT_ADDED", "PARTICIPANT_RENAMED", "PARTICIPANT_DELETED"]
  );
});

test("duplicate rename is rejected atomically without an audit revision", async (t) => {
  const { app, pollId, token } = await fixture(t, "duplicate-rename");
  const collection = `/api/public/polls/${token}/participants`;
  const alice = await app.http.handle({ method: "POST", path: collection, headers: {}, body: { displayName: "Alice" } });
  const bob = await app.http.handle({ method: "POST", path: collection, headers: {}, body: { displayName: "Bob" } });
  const bobId = bob.body.participants.find(({ displayName }) => displayName === "Bob").id;
  const auditBefore = await app.repository.listAuditEvents(pollId);
  const rejected = await app.http.handle({
    method: "PUT",
    path: `${collection}/${bobId}`,
    headers: {},
    body: { displayName: "ＡＬＩＣＥ" }
  });
  assert.equal(rejected.status, 409);
  assert.deepEqual(await app.repository.listAuditEvents(pollId), auditBefore);
  assert.deepEqual((await app.repository.listParticipants(pollId)).map(({ displayName }) => displayName), ["Alice", "Bob"]);
  assert.equal(alice.status, 201);
});

test("availability accepts only Yes or No, returns latest totals state, and audits each success", async (t) => {
  const { app, pollId, token } = await fixture(t, "availability");
  const collection = `/api/public/polls/${token}/participants`;
  const added = await app.http.handle({ method: "POST", path: collection, headers: {}, body: { displayName: "Alice" } });
  const participant = added.body.participants[0];
  const dateId = added.body.proposedDates[0].id;
  const item = `${collection}/${participant.id}`;
  const yes = await app.http.handle({ method: "PUT", path: item, headers: {}, body: { dateId, availability: "yes" } });
  assert.equal(yes.status, 200);
  assert.equal(yes.body.participants[0].availability[dateId], "yes");
  assert.deepEqual(yes.body.ranking, [
    { choiceId: dateId, yesTotal: 1 },
    { choiceId: yes.body.proposedDates[1].id, yesTotal: 0 }
  ]);
  assert.ok(yes.body.version > added.body.version);

  const auditAfterYes = await app.repository.listAuditEvents(pollId);
  const event = auditAfterYes.find(({ action }) => action === "AVAILABILITY_CHANGED");
  assert.equal(event.actorCategory, "anonymous-link-holder");
  assert.deepEqual(event.before, { value: "no" });
  assert.deepEqual(event.after, { value: "yes" });

  const invalid = await app.http.handle({ method: "PUT", path: item, headers: {}, body: { dateId, availability: "maybe" } });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await app.repository.listAuditEvents(pollId), auditAfterYes);
});

test("overlapping stale writes are both accepted, separately audited, and last commit wins", async (t) => {
  const { app, pollId, token } = await fixture(t, "contention");
  const collection = `/api/public/polls/${token}/participants`;
  const added = await app.http.handle({ method: "POST", path: collection, headers: {}, body: { displayName: "Alice" } });
  const participant = added.body.participants[0];
  const dateId = added.body.proposedDates[0].id;
  const path = `${collection}/${participant.id}`;
  const versionBefore = added.body.version;

  const results = await Promise.all([
    app.http.handle({ method: "PUT", path, headers: {}, body: { dateId, availability: "yes" } }),
    app.http.handle({ method: "PUT", path, headers: {}, body: { dateId, availability: "no" } })
  ]);
  assert.deepEqual(results.map(({ status }) => status), [200, 200]);
  const latest = await app.http.handle({ method: "GET", path: `/api/public/polls/${token}`, headers: {} });
  assert.equal(latest.body.version, versionBefore + 2);
  assert.ok(["yes", "no"].includes(latest.body.participants[0].availability[dateId]));
  const availabilityEvents = (await app.repository.listAuditEvents(pollId)).filter(({ action }) => action === "AVAILABILITY_CHANGED");
  assert.equal(availabilityEvents.length, 2);
  assert.deepEqual(availabilityEvents.map(({ revision }) => revision).sort((a, b) => a - b), [versionBefore + 1, versionBefore + 2]);
});
