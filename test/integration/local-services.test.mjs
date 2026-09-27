import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const localCompositionUrl = pathToFileURL(
  path.join(repositoryRoot, "backend/dist/adapters/local/composition.js")
).href;

const suffix = `${process.pid}-${Date.now()}`;
const config = Object.freeze({
  appEnv: "test",
  authMode: "local",
  awsRegion: "eu-west-2",
  dynamodbEndpoint:
    process.env.DYNAMODB_ENDPOINT ??
    `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`,
  appTableName: `invite-agent-test-app-${suffix}`,
  auditTableName: `invite-agent-test-audit-${suffix}`,
  publicBaseUrl: `http://127.0.0.1:${process.env.WEB_PORT ?? "15173"}`
});

async function loadLocalComposition() {
  try {
    return await import(localCompositionUrl);
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") {
      assert.fail(
        "the S-002 local composition is absent; implement it without changing this contract test"
      );
    }
    throw error;
  }
}

test("local DynamoDB tables are isolated, deterministic, and reachable without AWS credentials", async (t) => {
  const { createLocalComposition } = await loadLocalComposition();
  const app = await createLocalComposition(config);
  t.after(async () => app.dispose());

  await app.initializeTables();
  await app.initializeTables();

  assert.equal(app.config.appTableName, config.appTableName);
  assert.equal(app.config.auditTableName, config.auditTableName);
  assert.notEqual(app.config.appTableName, app.config.auditTableName);
  assert.deepEqual(await app.repository.health(), {
    appTable: "reachable",
    auditTable: "reachable"
  });
});

test("local HTTP uses shared validation, authorization, persistence, audit, and error mapping", async (t) => {
  const { createLocalComposition } = await loadLocalComposition();
  const app = await createLocalComposition(config);
  t.after(async () => app.dispose());
  await app.initializeTables();

  const health = await app.http.handle({ method: "GET", path: "/health", headers: {} });
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { status: "ok" });

  const unauthenticated = await app.http.handle({
    method: "POST",
    path: "/api/organiser/polls",
    headers: {},
    body: validPoll
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.body.error.code, "UNAUTHENTICATED");

  const invalid = await app.http.handle({
    method: "POST",
    path: "/api/organiser/polls",
    headers: { "x-local-organiser-id": "local-organiser-1" },
    body: { ...validPoll, title: "" }
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, "VALIDATION_ERROR");

  const created = await app.http.handle({
    method: "POST",
    path: "/api/organiser/polls",
    headers: { "x-local-organiser-id": "local-organiser-1" },
    body: validPoll
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.organiserId, undefined);
  assert.equal(created.body.title, validPoll.title);

  const stored = await app.repository.getPoll(created.body.id);
  assert.equal(stored.organiserId, "local-organiser-1");
  assert.equal(stored.title, validPoll.title);
  assert.deepEqual(
    (await app.repository.listAuditEvents(created.body.id)).map((event) => event.action),
    ["POLL_CREATED"]
  );

  const forbidden = await app.http.handle({
    method: "GET",
    path: `/api/organiser/polls/${created.body.id}`,
    headers: { "x-local-organiser-id": "local-organiser-2" }
  });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error.code, "FORBIDDEN");
});

test("local authentication cannot be composed outside local or test environments", async () => {
  const { createLocalComposition } = await loadLocalComposition();

  await assert.rejects(
    createLocalComposition({ ...config, appEnv: "production" }),
    /local authentication.*local or test/i
  );
  await assert.rejects(
    createLocalComposition({ ...config, authMode: "cognito" }),
    /local composition requires AUTH_MODE=local/i
  );
});

const validPoll = Object.freeze({
  title: "Local service integration",
  timeZone: "Europe/London",
  proposedDates: [Object.freeze({ kind: "date", localDate: "2026-10-12" })]
});
