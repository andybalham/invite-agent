import assert from "node:assert/strict";
import test from "node:test";
import { createLocalComposition } from "../../backend/dist/adapters/local/composition.js";
import { OWNED_POLL_SHARE_RESPONSE_HEADERS } from "../../packages/contracts/dist/index.js";
import { createIntegrationApp } from "../support/integration-fixture.mjs";
import { dashboardSnapshot } from "../support/my-polls-fixture.mjs";

const owner = { "x-local-organiser-id": "local-organiser-poll-page" };
const config = {
  appEnv: "test", authMode: "local", awsRegion: "eu-west-2",
  dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT ?? `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`,
  publicBaseUrl: "http://127.0.0.1:15173", publicTokenHashKey: "poll-page-share-test-hmac"
};
const input = {
  title: "Canonical sharing dinner", description: "Keep this description", location: "Community hall",
  timeZone: "Europe/London", proposedDates: [
    { kind: "date", localDate: "2026-11-10" }, { kind: "date", localDate: "2026-11-11" }
  ]
};

async function fixture(t, state) {
  const app = await createIntegrationApp(t, createLocalComposition, config);
  const created = await app.http.handle({ method: "POST", path: "/api/organiser/polls", headers: owner, body: input });
  assert.equal(created.status, 201);
  const id = created.body.id;
  const path = `/api/organiser/polls/${id}`;
  let publicUrl;
  if (state !== "draft") {
    const published = await app.http.handle({ method: "POST", path: `${path}/publish`, headers: owner });
    assert.equal(published.status, 200);
    publicUrl = published.body.publicUrl;
    const token = new URL(publicUrl).pathname.split("/").at(-1);
    const added = await app.http.handle({ method: "POST", path: `/api/public/polls/${token}/participants`,
      headers: {}, body: { displayName: "Alice" } });
    assert.equal(added.status, 201);
    const voted = await app.http.handle({ method: "PUT", path: `/api/public/polls/${token}/participants/${added.body.participants[0].id}`,
      headers: {}, body: { dateId: added.body.proposedDates[0].id, availability: "yes" } });
    assert.equal(voted.status, 200);
    if (state === "closed") {
      const closed = await app.http.handle({ method: "POST", path: `${path}/close`, headers: owner,
        body: { selectedDateId: voted.body.proposedDates[0].id, confirmed: true } });
      assert.equal(closed.status, 200);
    }
  }
  return { app, id, path, publicUrl };
}

function noSecrets(value, poll, tokens = []) {
  const serialized = JSON.stringify(value);
  for (const field of ["publicToken", "publicTokenHash", "encryptedPublicToken", "publicUrl", "ciphertext", "authTag", "iv", "keyId"]) {
    assert.equal(serialized.includes(`"${field}"`), false, field);
  }
  for (const secret of [poll.publicTokenHash, ...tokens].filter(Boolean)) {
    assert.equal(serialized.includes(secret), false);
  }
}

// T-164: the existing API contracts must stay green while the sharing surface moves.
for (const state of ["draft", "open", "closed"]) {
  test(`T-164 ${state}: capability-only and other-owner recovery/rotation are denied without storage changes`, async (t) => {
    const { app, id, path, publicUrl } = await fixture(t, state);
    const poll = await app.repository.getPoll(id);
    const before = await dashboardSnapshot(app);
    const token = publicUrl ? new URL(publicUrl).pathname.split("/").at(-1) : "a".repeat(32);
    for (const [method, suffix] of [["GET", "/share-link"], ["POST", "/share-link/rotate"]]) {
      for (const [headers, status, code] of [
        [{}, 401, "UNAUTHENTICATED"],
        [{ authorization: `Bearer ${token}` }, 401, "UNAUTHENTICATED"],
        [{ "x-local-organiser-id": "local-organiser-other" }, 403, "FORBIDDEN"]
      ]) {
        const result = await app.http.handle({ method, path: `${path}${suffix}`, headers });
        assert.equal(result.status, status);
        assert.equal(result.body.error.code, code);
        assert.deepEqual(result.headers, OWNED_POLL_SHARE_RESPONSE_HEADERS);
        noSecrets(result.body, poll, [token]);
      }
      if (state === "draft") {
        const result = await app.http.handle({ method, path: `${path}${suffix}`, headers: owner });
        assert.equal(result.status, 422);
        assert.equal(result.body.error.code, "INVALID_LIFECYCLE");
        noSecrets(result.body, poll);
      } else {
        const result = await app.http.handle({ method: "GET", path: `${path}/share-link`, headers: owner });
        assert.equal(result.status, 200);
        assert.deepEqual(result.body, { publicUrl });
        assert.deepEqual(result.headers, OWNED_POLL_SHARE_RESPONSE_HEADERS);
      }
    }
    assert.deepEqual(await dashboardSnapshot(app), before);
  });
}

for (const state of ["open", "closed"]) {
  test(`T-164 ${state}: rotation revokes old reads/writes and preserves responses, dates, lifecycle and existing history`, async (t) => {
    const { app, id, path, publicUrl } = await fixture(t, state);
    const oldToken = new URL(publicUrl).pathname.split("/").at(-1);
    const before = await app.repository.getPoll(id);
    const participants = await app.repository.listParticipants(id);
    const history = await app.repository.listAuditEvents(id);
    assert.equal(participants.length, 1);
    assert.ok(Object.values(participants[0].availability).includes("yes"));
    const rotated = await app.http.handle({ method: "POST", path: `${path}/share-link/rotate`, headers: owner });
    assert.equal(rotated.status, 200);
    assert.deepEqual(rotated.headers, OWNED_POLL_SHARE_RESPONSE_HEADERS);
    assert.deepEqual(Object.keys(rotated.body), ["publicUrl"]);
    const token = new URL(rotated.body.publicUrl).pathname.split("/").at(-1);
    assert.notEqual(token, oldToken);
    const after = await app.repository.getPoll(id);
    assert.equal(after.version, before.version + 1);
    assert.deepEqual({ ...after, version: before.version, publicTokenHash: before.publicTokenHash,
      encryptedPublicToken: before.encryptedPublicToken }, before);
    assert.deepEqual(await app.repository.listParticipants(id), participants);
    const events = await app.repository.listAuditEvents(id);
    assert.deepEqual(events.slice(0, history.length), history);
    assert.equal(events.length, history.length + 1);
    assert.equal(events.at(-1).action, "public_link.rotated");
    noSecrets(events, after, [oldToken, token]);
    for (const [method, suffix, body] of [["GET", "", undefined],
      ["POST", "/participants", { displayName: "Rejected" }],
      ["PUT", `/participants/${participants[0].id}`, { dateId: `${id}-date-1`, availability: "no" }]]) {
      const revoked = await app.http.handle({ method, path: `/api/public/polls/${oldToken}${suffix}`, headers: {}, body });
      assert.equal(revoked.status, 410);
      assert.equal(revoked.body.error.code, "LINK_REVOKED");
    }
    const current = await app.http.handle({ method: "GET", path: `/api/public/polls/${token}`, headers: {} });
    assert.equal(current.status, 200);
    assert.equal(current.body.status, state);
    assert.equal(current.body.participants[0].displayName, "Alice");
    noSecrets(current.body, after, [oldToken, token]);
    const recovered = await app.http.handle({ method: "GET", path: `${path}/share-link`, headers: owner });
    assert.deepEqual(recovered.body, rotated.body);
    assert.deepEqual(await app.repository.listAuditEvents(id), events);
    assert.deepEqual(await app.repository.listParticipants(id), participants);
  });
}
