import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import net from "node:net";
import path from "node:path";
import test from "node:test";

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

// Run the real API, Vite, config, coordinator and browser workers against a
// controlled AWS JSON transport. No developer database or Docker is required.
test("ordinary Playwright runs own distinct pairs; workers use the attested custom configuration without API initialization", { timeout: 120_000 }, async (t) => {
  const tables = new Map([
    ["invite-agent-local-app", { retained: ["browser poll"] }],
    ["invite-agent-local-audit", { retained: ["browser history"] }],
    ["caller-app", { retained: ["caller poll"] }], ["caller-audit", { retained: ["caller history"] }]
  ]);
  const before = structuredClone([...tables]);
  const calls = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const operation = request.headers["x-amz-target"].split(".").at(-1);
    calls.push({ operation, input, regionMatches: request.headers.authorization.includes("/us-east-1/dynamodb/") });
    response.setHeader("content-type", "application/x-amz-json-1.0");
    const missing = () => {
      response.statusCode = 400;
      response.end(JSON.stringify({ __type: "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException", message: "absent" }));
    };
    const table = tables.get(input.TableName);
    if (operation === "CreateTable") {
      if (table) { response.statusCode = 400; response.end(JSON.stringify({ __type: "ResourceInUseException", message: "collision" })); return; }
      const schema = { ...input, TableStatus: "ACTIVE", CreationDateTime: Date.now() / 1000,
        BillingModeSummary: { BillingMode: "PAY_PER_REQUEST" },
        GlobalSecondaryIndexes: input.GlobalSecondaryIndexes?.map((index) => ({ ...index, IndexStatus: "ACTIVE" })) };
      tables.set(input.TableName, { schema });
      response.end(JSON.stringify({ TableDescription: schema }));
    } else if (!table) missing();
    else if (operation === "DescribeTable") response.end(JSON.stringify({ Table: table.schema }));
    else if (operation === "PutItem") { table.marker = input.Item; response.end("{}"); }
    else if (operation === "GetItem") response.end(JSON.stringify({ Item: table.marker }));
    else if (operation === "Query") response.end(JSON.stringify({ Items: [], Count: 0 }));
    else { response.statusCode = 500; response.end(JSON.stringify({ message: `Unexpected ${operation}` })); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const dynamodbPort = server.address().port;
  const runIds = [];
  for (let invocation = 0; invocation < 2; invocation += 1) {
    const apiPort = await freePort();
    let webPort = await freePort();
    while (webPort === apiPort) webPort = await freePort();
    const environment = { ...process.env, APP_ENV: "local", AUTH_MODE: "local", E2E_ALLOW_SHARED_TABLES: "0",
      DYNAMODB_ENDPOINT: `http://localhost:${dynamodbPort}`, DYNAMODB_PORT: String(dynamodbPort), API_PORT: String(apiPort), WEB_PORT: String(webPort),
      APP_TABLE_NAME: "invite-agent-local-app", AUDIT_TABLE_NAME: "caller-audit", AWS_REGION: "us-east-1", PUBLIC_TOKEN_HASH_KEY: "runner-private-key" };
    for (const key of ["E2E_MODE", "E2E_RUN_ID", "E2E_RUN_MANIFEST_PATH", "E2E_COORDINATOR_PID", "E2E_API_INSTANCE_ID", "SMOKE_RUN_MANIFEST_PATH", "PUBLIC_BASE_URL"]) delete environment[key];
    const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "test/e2e/shell.spec.ts", "--workers=2", "--repeat-each=2", "--retries=0"], { env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    const exit = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
    assert.equal(exit, 0, output);
    assert.match(output, /2 passed/);
    const directory = /E2E evidence: ([^\r\n]+)/.exec(output)?.[1];
    assert.ok(directory, output);
    const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
    runIds.push(manifest.runId);
    assert.equal(manifest.phase, "teardown");
    assert.equal(manifest.configuration.apiPort, apiPort);
    assert.equal(manifest.configuration.webPort, webPort);
    assert.equal(manifest.region, "us-east-1");
    assert.equal(manifest.coordinator.pid, child.pid);
    assert.equal(manifest.services.processes.length, 2);
    assert.ok(manifest.tables.every((entry) => entry.owned && tables.get(entry.name)?.marker.nonce.S === manifest.ownershipNonce));
    assert.ok(!JSON.stringify(manifest).includes(environment.PUBLIC_TOKEN_HASH_KEY));
    for (const identity of manifest.services.processes) assert.throws(() => process.kill(identity.pid, 0), /ESRCH|EPERM/);
  }
  assert.notEqual(runIds[0], runIds[1]);
  assert.deepEqual([...tables].filter(([name]) => !name.startsWith("invite-agent-e2e-")), before);
  const creates = calls.filter(({ operation }) => operation === "CreateTable");
  assert.equal(creates.length, 4, "API must not reinitialize/migrate exclusively provisioned tables");
  assert.equal(new Set(creates.map(({ input }) => input.TableName)).size, 4);
  assert.ok(calls.every(({ regionMatches }) => regionMatches));
  assert.ok(calls.every(({ input }) => input.TableName.startsWith("invite-agent-e2e-")));
  assert.ok(!calls.some(({ operation }) => ["UpdateTable", "DeleteTable", "Scan"].includes(operation)));
});
