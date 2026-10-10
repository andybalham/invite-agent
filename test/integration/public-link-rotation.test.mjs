import assert from "node:assert/strict";
import test from "node:test";
import { UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { createLocalComposition } from "../../backend/dist/adapters/local/composition.js";
import { createIntegrationApp, integrationClient } from "../support/integration-fixture.mjs";
import { dashboardSnapshot } from "../support/my-polls-fixture.mjs";
import { OWNED_POLL_SHARE_RESPONSE_HEADERS } from "../../packages/contracts/dist/index.js";

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

function assertRedacted(value, records, tokens) {
  const serialized = JSON.stringify(value);
  for (const field of ["publicToken", "publicTokenHash", "encryptedPublicToken", "publicUrl", "keyId", "ciphertext", "iv", "authTag"]) {
    assert.equal(serialized.includes(`"${field}"`), false, field);
  }
  for (const secret of [...tokens, ...records.flatMap((record) => [record.publicTokenHash,
    ...Object.values(record.encryptedPublicToken ?? {}).filter((value) => typeof value === "string")])]) {
    assert.equal(serialized.includes(secret), false);
  }
}

test("T-150 owner recovery and denied calls preserve complete storage; rotation keeps API projections and audit redacted", async (t) => {
  const { app, id, oldToken } = await fixture(t);
  const path = `/api/organiser/polls/${id}/share-link`;
  const before = await dashboardSnapshot(app);
  const original = await app.repository.getPoll(id);
  for (const method of ["GET", "POST"]) {
    for (const [headers, status, code] of [[{}, 401, "UNAUTHENTICATED"],
      [{ authorization: `Bearer ${oldToken}` }, 401, "UNAUTHENTICATED"],
      [{ "x-local-organiser-id": "local-organiser-other" }, 403, "FORBIDDEN"]]) {
      const result = await app.http.handle({ method, path: method === "GET" ? path : `${path}/rotate`, headers });
      assert.equal(result.status, status);
      assert.equal(result.body.error.code, code);
      assert.deepEqual(result.headers, OWNED_POLL_SHARE_RESPONSE_HEADERS);
      assertRedacted(result.body, [original], [oldToken]);
    }
  }
  for (let retry = 0; retry < 3; retry++) {
    const recovered = await app.http.handle({ method: "GET", path, headers: owner });
    assert.equal(recovered.status, 200);
    assert.deepEqual(recovered.body, { publicUrl: `${config.publicBaseUrl}/p/${oldToken}` });
    assert.deepEqual(recovered.headers, OWNED_POLL_SHARE_RESPONSE_HEADERS);
  }
  assert.deepEqual(await dashboardSnapshot(app), before);
  const rotated = await app.http.handle({ method: "POST", path: `${path}/rotate`, headers: owner });
  assert.equal(rotated.status, 200);
  const replacement = rotated.body.publicUrl.split("/").at(-1);
  const current = await app.repository.getPoll(id);
  const after = await dashboardSnapshot(app);
  const ownerGet = await app.http.handle({ method: "GET", path, headers: owner });
  assert.deepEqual(ownerGet.body, rotated.body);
  for (const request of [
    { path: `/api/organiser/polls/${id}`, headers: owner },
    { path: "/api/organiser/polls", headers: owner },
    { path: `/api/public/polls/${replacement}`, headers: {} },
    { path: `/api/organiser/polls/${id}/history`, headers: owner }
  ]) {
    const result = await app.http.handle({ method: "GET", ...request });
    assert.equal(result.status, 200);
    if (request.path === "/api/organiser/polls") assert.deepEqual(result.body.items.map(({ id }) => id), [id]);
    assertRedacted(result.body, [original, current], [oldToken, replacement]);
  }
  const events = await app.repository.listAuditEvents(id);
  assertRedacted(events, [original, current], [oldToken, replacement]);
  const rotation = events.filter(({ action }) => action === "public_link.rotated");
  assert.equal(rotation.length, 1);
  assert.equal(rotation[0].actorId, owner["x-local-organiser-id"]);
  assert.equal(rotation[0].entityId, id);
  assert.deepEqual(rotation[0].before, { lifecycle: "open", publicLinkState: "recoverable" });
  assert.deepEqual(rotation[0].after, { lifecycle: "open", publicLinkState: "recoverable",
    previousCapability: "revoked", currentCapability: "active" });
  assert.deepEqual(await dashboardSnapshot(app), after);
});

test("T-150 legacy recovery is owner-only and read-only until explicit rotation commits", async (t) => {
  const { app, id, oldToken } = await fixture(t);
  const client = integrationClient(app.config.dynamodbEndpoint);
  t.after(() => client.destroy());
  const { encryptedPublicToken: _envelope, ...legacy } = await app.repository.getPoll(id);
  // Seed a historical record in this fixture's disposable table only.
  await client.send(new UpdateItemCommand({ TableName: app.config.appTableName,
    Key: { PK: { S: `POLL#${id}` }, SK: { S: "METADATA" } },
    UpdateExpression: "SET #document = :legacy", ExpressionAttributeNames: { "#document": "document" },
    ExpressionAttributeValues: { ":legacy": { S: JSON.stringify(legacy) } } }));
  const before = await dashboardSnapshot(app);
  const path = `/api/organiser/polls/${id}/share-link`;
  const denied = await app.http.handle({ method: "GET", path, headers: { "x-local-organiser-id": "local-organiser-other" } });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, "FORBIDDEN");
  const recovery = await app.http.handle({ method: "GET", path, headers: owner });
  assert.equal(recovery.status, 409);
  assert.deepEqual(recovery.body, { error: { code: "LINK_RECOVERY_REQUIRED",
    message: "The existing link cannot be recovered. Replacing it requires confirmation and will stop the old link working." } });
  assert.deepEqual(recovery.headers, OWNED_POLL_SHARE_RESPONSE_HEADERS);
  assertRedacted(recovery.body, [legacy], [oldToken]);
  assert.equal((await app.http.handle({ method: "GET", path: `/api/public/polls/${oldToken}`, headers: {} })).status, 200);
  assert.deepEqual(await dashboardSnapshot(app), before);
  const result = await app.http.handle({ method: "POST", path: `${path}/rotate`, headers: owner });
  assert.equal(result.status, 200);
  const replacement = result.body.publicUrl.split("/").at(-1);
  const recovered = await app.http.handle({ method: "GET", path, headers: owner });
  assert.deepEqual(recovered.body, result.body);
  const events = await app.repository.listAuditEvents(id);
  const rotations = events.filter(({ action }) => action === "public_link.rotated");
  assert.equal(rotations.length, 1);
  assert.deepEqual(rotations[0].before, { lifecycle: "open", publicLinkState: "legacy" });
  assertRedacted(events, [legacy, await app.repository.getPoll(id)], [oldToken, replacement]);
  for (const request of [{ method: "GET" }, { method: "POST", body: { displayName: "Alice" } }]) {
    const revoked = await app.http.handle({ ...request, path: `/api/public/polls/${oldToken}${request.method === "POST" ? "/participants" : ""}`, headers: {} });
    assert.equal(revoked.status, 410);
    assert.equal(revoked.body.error.code, "LINK_REVOKED");
  }
  assert.equal((await app.http.handle({ method: "GET", path: `/api/public/polls/${replacement}`, headers: {} })).status, 200);
});
