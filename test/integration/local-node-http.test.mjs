import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createIntegrationApp } from "../support/integration-fixture.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const localAdapterUrl = pathToFileURL(
  path.join(repositoryRoot, "backend/dist/adapters/local/index.js")
).href;

test("the Node HTTP adapter translates requests through the shared handler", async (t) => {
  const { createLocalComposition, createLocalNodeServer } = await import(localAdapterUrl);
  const suffix = `http-${process.pid}-${Date.now()}`;
  let server;
  const app = await createIntegrationApp(t, createLocalComposition, {
    appEnv: "test",
    authMode: "local",
    awsRegion: "eu-west-2",
    dynamodbEndpoint:
      process.env.DYNAMODB_ENDPOINT ??
      `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`,
    appTableName: `invite-agent-test-app-${suffix}`,
    auditTableName: `invite-agent-test-audit-${suffix}`,
    publicBaseUrl: `http://127.0.0.1:${process.env.WEB_PORT ?? "15173"}`
  }, { beforeCleanup: [async () => {
    if (!server?.listening) return;
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  }] });

  server = createLocalNodeServer(app.http);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.notEqual(address, null);
  assert.notEqual(typeof address, "string");
  const origin = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${origin}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });

  const protectedResponse = await fetch(`${origin}/api/organiser/polls`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Adapter contract",
      timeZone: "Europe/London",
      proposedDates: [{ kind: "date", localDate: "2026-10-12" }]
    })
  });
  assert.equal(protectedResponse.status, 401);
  assert.equal((await protectedResponse.json()).error.code, "UNAUTHENTICATED");
});
