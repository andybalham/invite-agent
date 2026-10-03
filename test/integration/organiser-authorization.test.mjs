import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createIntegrationApp } from "../support/integration-fixture.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const compositionUrl = pathToFileURL(path.join(root, "backend/dist/adapters/local/composition.js")).href;
const validPoll = {
  title: "Ownership contract",
  timeZone: "Europe/London",
  proposedDates: [
    { kind: "date", localDate: "2026-10-10" },
    { kind: "date", localDate: "2026-10-17" }
  ]
};

test("every organiser route derives identity from verified context and rejects capability-only callers", async (t) => {
  const { createLocalComposition } = await import(compositionUrl);
  const suffix = `auth-${process.pid}-${Date.now()}`;
  const app = await createIntegrationApp(t, createLocalComposition, {
    appEnv: "test", authMode: "local", awsRegion: "eu-west-2",
    dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT ?? `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`,
    appTableName: `invite-agent-test-app-${suffix}`, auditTableName: `invite-agent-test-audit-${suffix}`,
    publicBaseUrl: "http://127.0.0.1:15173", publicTokenHashKey: "authorization-test-key"
  });
  const ownerHeaders = { "x-local-organiser-id": "local-organiser-owner" };
  const created = await app.http.handle({ method: "POST", path: "/api/organiser/polls", headers: ownerHeaders, body: validPoll });
  const id = created.body.id;
  const routes = [
    { method: "GET", path: `/api/organiser/polls/${id}` },
    { method: "PUT", path: `/api/organiser/polls/${id}`, body: validPoll },
    { method: "POST", path: `/api/organiser/polls/${id}/publication-readiness` },
    { method: "POST", path: `/api/organiser/polls/${id}/publish` }
  ];
  for (const route of routes) {
    const before = await app.repository.getPoll(id);
    const auditCount = (await app.repository.listAuditEvents(id)).length;
    const missing = await app.http.handle({ ...route, headers: {} });
    const capabilityOnly = await app.http.handle({ ...route, headers: { authorization: "Bearer public-token" } });
    const other = await app.http.handle({ ...route, headers: { "x-local-organiser-id": "local-organiser-other" } });
    assert.equal(missing.status, 401, `${route.method} ${route.path} missing identity`);
    assert.equal(capabilityOnly.status, 401, `${route.method} ${route.path} capability-only`);
    assert.equal(other.status, 403, `${route.method} ${route.path} wrong owner`);
    assert.deepEqual(await app.repository.getPoll(id), before);
    assert.equal((await app.repository.listAuditEvents(id)).length, auditCount);
  }

  const spoofed = await app.http.handle({
    method: "POST", path: "/api/organiser/polls", headers: ownerHeaders,
    body: { ...validPoll, organiserId: "local-organiser-other", ownerId: "local-organiser-other" }
  });
  assert.equal(spoofed.status, 201);
  assert.equal((await app.repository.getPoll(spoofed.body.id)).organiserId, "local-organiser-owner");
});
