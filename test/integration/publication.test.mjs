import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const compositionUrl = pathToFileURL(path.join(root, "backend/dist/adapters/local/composition.js")).href;
const suffix = `publication-${process.pid}-${Date.now()}`;
const config = {
  appEnv: "test", authMode: "local", awsRegion: "eu-west-2",
  dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT ?? `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`,
  appTableName: `invite-agent-test-app-${suffix}`, auditTableName: `invite-agent-test-audit-${suffix}`,
  publicBaseUrl: "http://127.0.0.1:15173", publicTokenHashKey: "integration-test-token-key"
};
const headers = { "x-local-organiser-id": "local-organiser-publication" };
const validPoll = {
  title: "Autumn get-together", description: "Choose every date you can attend.",
  instructions: "Reply by Friday.", location: "**Community Hall** — [map](https://example.test/map)",
  timeZone: "Europe/London", proposedDates: [
    { kind: "date", localDate: "2026-10-10" },
    { kind: "date-time", localDateTime: "2026-10-17T18:00" }
  ]
};

test("publishing is atomic, stores only a token hash, and resolves a private public projection", async (t) => {
  const { createLocalComposition } = await import(compositionUrl);
  const app = await createLocalComposition(config);
  t.after(() => app.dispose());
  await app.initializeTables();

  const created = await app.http.handle({ method: "POST", path: "/api/organiser/polls", headers, body: validPoll });
  const pollId = created.body.id;
  const published = await app.http.handle({ method: "POST", path: `/api/organiser/polls/${pollId}/publish`, headers });
  assert.equal(published.status, 200);
  assert.equal(published.body.poll.status, "open");
  assert.match(published.body.publicUrl, /\/p\/[A-Za-z0-9_-]{32}$/);
  const token = published.body.publicUrl.split("/").at(-1);

  const stored = await app.repository.getPoll(pollId);
  assert.equal(stored.status, "open");
  assert.match(stored.publicTokenHash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(stored).includes(token), false);
  const audit = await app.repository.listAuditEvents(pollId);
  assert.deepEqual(audit.map(({ action }) => action), ["POLL_CREATED", "POLL_PUBLISHED"]);
  assert.equal(JSON.stringify(audit).includes(token), false);

  const publicResult = await app.http.handle({ method: "GET", path: `/api/public/polls/${token}`, headers: {} });
  assert.equal(publicResult.status, 200);
  assert.equal(publicResult.body.title, validPoll.title);
  assert.equal(publicResult.body.status, "open");
  assert.equal(publicResult.body.locationHtml.includes("javascript:"), false);
  for (const forbidden of ["organiserId", "publicTokenHash", "audit", "actorId"]) {
    assert.equal(JSON.stringify(publicResult.body).includes(forbidden), false);
  }

  await app.repository.revokePublicToken(stored.publicTokenHash);
  const revoked = await app.http.handle({ method: "GET", path: `/api/public/polls/${token}`, headers: {} });
  assert.equal(revoked.status, 410);
  assert.deepEqual(revoked.body, {
    error: { code: "LINK_REVOKED", message: "This poll link is no longer valid" }
  });

  const again = await app.http.handle({ method: "POST", path: `/api/organiser/polls/${pollId}/publish`, headers });
  assert.equal(again.status, 422);
  assert.equal((await app.repository.listAuditEvents(pollId)).length, 2);
});

test("invalid publication and rejected organiser calls have no data or audit effects", async (t) => {
  const { createLocalComposition } = await import(compositionUrl);
  const app = await createLocalComposition({ ...config, appTableName: `${config.appTableName}-invalid`, auditTableName: `${config.auditTableName}-invalid` });
  t.after(() => app.dispose());
  await app.initializeTables();
  const created = await app.http.handle({ method: "POST", path: "/api/organiser/polls", headers, body: { ...validPoll, proposedDates: validPoll.proposedDates.slice(0, 1) } });
  const pollId = created.body.id;
  const before = await app.repository.getPoll(pollId);

  for (const [requestHeaders, status] of [[{}, 401], [{ "x-local-organiser-id": "local-organiser-other" }, 403], [{ authorization: "Bearer public-capability" }, 401]]) {
    const response = await app.http.handle({ method: "POST", path: `/api/organiser/polls/${pollId}/publish`, headers: requestHeaders });
    assert.equal(response.status, status);
  }
  const invalid = await app.http.handle({ method: "POST", path: `/api/organiser/polls/${pollId}/publish`, headers });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await app.repository.getPoll(pollId), before);
  assert.equal((await app.repository.listAuditEvents(pollId)).length, 1);
  for (const token of ["", "1", "A".repeat(32), "not/base64url".padEnd(32, "x")]) {
    const response = await app.http.handle({ method: "GET", path: `/api/public/polls/${token}`, headers: {} });
    assert.equal(response.status, 404);
    assert.equal(JSON.stringify(response.body).includes(validPoll.title), false);
  }
});

test("concurrent publication has exactly one winner and one publication audit event", async (t) => {
  const { createLocalComposition } = await import(compositionUrl);
  const app = await createLocalComposition({
    ...config,
    appTableName: `${config.appTableName}-concurrent`,
    auditTableName: `${config.auditTableName}-concurrent`
  });
  t.after(() => app.dispose());
  await app.initializeTables();
  const created = await app.http.handle({ method: "POST", path: "/api/organiser/polls", headers, body: validPoll });
  const path = `/api/organiser/polls/${created.body.id}/publish`;
  const results = await Promise.all([
    app.http.handle({ method: "POST", path, headers }),
    app.http.handle({ method: "POST", path, headers })
  ]);
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
  assert.deepEqual(
    (await app.repository.listAuditEvents(created.body.id)).map(({ action }) => action),
    ["POLL_CREATED", "POLL_PUBLISHED"]
  );
});
