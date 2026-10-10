import assert from "node:assert/strict";
import test from "node:test";
import { createLocalComposition } from "../../backend/dist/adapters/local/composition.js";
import { createIntegrationApp } from "../support/integration-fixture.mjs";

const owner = { "x-local-organiser-id": "local-organiser-rotation" };
const config = { appEnv: "test", authMode: "local", awsRegion: "eu-west-2",
  dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT ?? `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`,
  appTableName: "unused", auditTableName: "unused", publicBaseUrl: "http://127.0.0.1:15173",
  publicTokenHashKey: "rotation-integration-hmac" };
const input = { title: "Dinner", timeZone: "Europe/London", proposedDates: [
  { kind: "date", localDate: "2026-11-10" }, { kind: "date", localDate: "2026-11-11" }
] };

async function fixture(t) {
  const app = await createIntegrationApp(t, createLocalComposition, config);
  const created = await app.http.handle({ method: "POST", path: "/api/organiser/polls", headers: owner, body: input });
  assert.equal(created.status, 201);
  const id = created.body.id;
  const published = await app.http.handle({ method: "POST", path: `/api/organiser/polls/${id}/publish`, headers: owner });
  assert.equal(published.status, 200);
  return { app, id, oldToken: published.body.publicUrl.split("/").at(-1) };
}

test("committed rotation revokes old public reads and writes and keeps the replacement live", async (t) => {
  const { app, id, oldToken } = await fixture(t);
  const before = await app.repository.getPoll(id);
  const eventsBefore = await app.repository.listAuditEvents(id);
  const result = await app.http.handle({ method: "POST", path: `/api/organiser/polls/${id}/share-link/rotate`, headers: owner });
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body), ["publicUrl"]);
  const replacement = result.body.publicUrl.split("/").at(-1);
  assert.notEqual(replacement, oldToken);
  const after = await app.repository.getPoll(id);
  assert.equal(after.version, before.version + 1);
  assert.notEqual(after.publicTokenHash, before.publicTokenHash);
  assert.notDeepEqual(after.encryptedPublicToken, before.encryptedPublicToken);
  assert.deepEqual({ ...after, version: before.version, publicTokenHash: before.publicTokenHash,
    encryptedPublicToken: before.encryptedPublicToken }, before);
  assert.equal((await app.repository.getPublicToken(before.publicTokenHash)).state, "revoked");
  assert.deepEqual(await app.repository.getPublicToken(after.publicTokenHash), { pollId: id, state: "active" });
  const events = await app.repository.listAuditEvents(id);
  assert.equal(events.length, eventsBefore.length + 1);
  assert.equal(events.at(-1).action, "public_link.rotated");
  for (const secret of [oldToken, replacement, before.publicTokenHash, after.publicTokenHash]) {
    assert.equal(JSON.stringify(events.at(-1)).includes(secret), false);
  }
  const oldRead = await app.http.handle({ method: "GET", path: `/api/public/polls/${oldToken}`, headers: {} });
  const oldWrite = await app.http.handle({ method: "POST", path: `/api/public/polls/${oldToken}/participants`,
    headers: {}, body: { displayName: "Alice" } });
  assert.equal(oldRead.status, 410);
  assert.equal(oldRead.body.error.code, "LINK_REVOKED");
  assert.equal(oldWrite.status, 410);
  assert.equal(oldWrite.body.error.code, "LINK_REVOKED");
  const current = await app.http.handle({ method: "GET", path: `/api/public/polls/${replacement}`, headers: {} });
  assert.equal(current.status, 200);
  assert.equal(current.body.id, id);
  const ownerGet = await app.http.handle({ method: "GET", path: `/api/organiser/polls/${id}/share-link`, headers: owner });
  assert.equal(ownerGet.body.publicUrl, result.body.publicUrl);
});

test("two rotations from the same observed revision allow one commit and one safe conflict", async (t) => {
  const { app, id, oldToken } = await fixture(t);
  const originalGetPoll = app.repository.getPoll.bind(app.repository);
  let waiting = [];
  app.repository.getPoll = async (pollId) => {
    const observed = await originalGetPoll(pollId);
    waiting.push(() => {});
    if (waiting.length === 2) {
      const release = waiting;
      waiting = [];
      for (const resolve of release) resolve();
    } else {
      await new Promise((resolve) => { waiting[waiting.length - 1] = resolve; });
    }
    return observed;
  };
  const path = `/api/organiser/polls/${id}/share-link/rotate`;
  const results = await Promise.all([
    app.http.handle({ method: "POST", path, headers: owner }),
    app.http.handle({ method: "POST", path, headers: owner })
  ]);
  app.repository.getPoll = originalGetPoll;
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
  assert.equal(results.find(({ status }) => status === 409).body.error.code, "LINK_ROTATION_CONFLICT");
  assert.equal((await app.repository.listAuditEvents(id)).filter(({ action }) => action === "public_link.rotated").length, 1);
  const old = await app.http.handle({ method: "GET", path: `/api/public/polls/${oldToken}`, headers: {} });
  assert.equal(old.status, 410);
});
