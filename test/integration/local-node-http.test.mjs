import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const localAdapterUrl = pathToFileURL(
  path.join(repositoryRoot, "backend/dist/adapters/local/index.js")
).href;

test("the Node HTTP adapter translates requests through the shared handler", async (t) => {
  const { createLocalComposition, createLocalNodeServer } = await import(localAdapterUrl);
  const suffix = `http-${process.pid}-${Date.now()}`;
  const app = await createLocalComposition({
    appEnv: "test",
    authMode: "local",
    awsRegion: "eu-west-2",
    dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT ?? "http://127.0.0.1:8000",
    appTableName: `invite-agent-test-app-${suffix}`,
    auditTableName: `invite-agent-test-audit-${suffix}`,
    publicBaseUrl: "http://localhost:5173"
  });
  await app.initializeTables();

  const server = createLocalNodeServer(app.http);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    await app.dispose();
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
