import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ResourceInUseException } from "@aws-sdk/client-dynamodb";
import { assertEffectiveEnvironment, e2eEnvironment, e2eTableNames, localEndpoint, newRunId, resolveE2EConfiguration } from "../../backend/dist/adapters/local/e2e-config.js";
import { createE2EManifest, provisionE2ETables, readE2EManifest, verifyE2EOwnership } from "../../backend/dist/adapters/local/e2e-resources.js";
import { createE2EAttestation, preflightE2E } from "../../backend/dist/adapters/local/e2e-runtime.js";
import { assertFreePort } from "../../scripts/e2e-run-coordinator.mjs";

function memoryClient() {
  const tables = new Map();
  const calls = [];
  return { tables, calls, beforeSend: null, async send(command) {
    const type = command.constructor.name;
    const { TableName: name } = command.input;
    calls.push({ type, ...command.input });
    await this.beforeSend?.(command);
    if (type === "CreateTableCommand") {
      if (tables.has(name)) throw new ResourceInUseException({ message: "race collision", $metadata: {} });
      tables.set(name, { schema: { ...command.input, TableStatus: "ACTIVE", CreationDateTime: new Date("2026-10-06T12:00:00.000Z"),
        BillingModeSummary: { BillingMode: "PAY_PER_REQUEST" },
        GlobalSecondaryIndexes: command.input.GlobalSecondaryIndexes?.map((index) => ({ ...index, IndexStatus: "ACTIVE" })) } });
      return {};
    }
    const table = tables.get(name);
    if (!table) throw Object.assign(new Error("absent"), { name: "ResourceNotFoundException" });
    if (type === "DescribeTableCommand") return { Table: structuredClone(table.schema) };
    if (type === "PutItemCommand") {
      assert.equal(command.input.ConditionExpression, "attribute_not_exists(PK)");
      if (table.marker) throw new Error("conditional marker collision");
      table.marker = structuredClone(command.input.Item);
      return {};
    }
    if (type === "GetItemCommand") { assert.equal(command.input.ConsistentRead, true); return { Item: structuredClone(table.marker) }; }
    throw new Error(`Unexpected ${type}`);
  } };
}

async function fixture(t, environment = {}) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "invite-e2e-provision-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runId = newRunId();
  const config = resolveE2EConfiguration(environment, runId);
  const directory = path.join(root, runId);
  await mkdir(directory);
  config.manifestPath = path.join(directory, "manifest.json");
  const coordinator = { pid: process.pid, startTimeUtcFileTime: "134356988979243596", runId, manifestPath: config.manifestPath };
  const manifest = await createE2EManifest(config, coordinator, ["controlled-test"]);
  return { config, manifest, file: config.manifestPath, client: memoryClient() };
}

test("isolated resolution replaces inherited tables and propagates exact custom routing/region/hash settings", () => {
  const input = { APP_TABLE_NAME: "invite-agent-local-app", AUDIT_TABLE_NAME: "custom-persistent-audit", DYNAMODB_ENDPOINT: "http://localhost:18123/", API_PORT: "14123", WEB_PORT: "15123", AWS_REGION: "us-east-1", PUBLIC_TOKEN_HASH_KEY: "private-test-key" };
  const first = resolveE2EConfiguration(input, newRunId());
  const second = resolveE2EConfiguration(input, newRunId());
  assert.notEqual(first.appTableName, second.appTableName);
  assert.notEqual(first.auditTableName, second.auditTableName);
  assert.equal(first.endpoint, "http://127.0.0.1:18123");
  assert.equal(first.appEnv, "test");
  assert.equal(first.authMode, "local");
  assert.equal(first.webOrigin, "http://127.0.0.1:15123");
  const environment = e2eEnvironment(first, input);
  assert.equal(environment.AWS_REGION, "us-east-1");
  assert.equal(environment.PUBLIC_TOKEN_HASH_KEY, input.PUBLIC_TOKEN_HASH_KEY);
  assert.equal(environment.APP_TABLE_NAME, first.appTableName);
  assert.equal(environment.AUDIT_TABLE_NAME, first.auditTableName);
  assertEffectiveEnvironment(first, environment);
  for (const key of ["APP_TABLE_NAME", "AUDIT_TABLE_NAME", "DYNAMODB_ENDPOINT", "AWS_REGION", "APP_ENV", "AUTH_MODE", "API_PORT", "WEB_PORT"]) {
    assert.throws(() => assertEffectiveEnvironment(first, { ...environment, [key]: "wrong" }), /drift/);
  }
  assert.equal(resolveE2EConfiguration({ DYNAMODB_PORT: "80" }, newRunId()).dynamodbPort, 80);
});

test("unsafe endpoints, invalid modes/environments, conflicts and implicit shared targets fail before resources", () => {
  for (const endpoint of ["https://127.0.0.1:18000", "http://example.com:18000", "http://[::1]:18000", "http://127.0.0.1", "http://127.0.0.1:0", "http://127.0.0.1:65536", "http://127.0.0.1:18000?", "http://127.0.0.1:18000#", "http://127.0.0.1:18000/a/..", "http://user@localhost:18000", "http://127.1:18000", "http://2130706433:18000"]) assert.throws(() => localEndpoint(endpoint));
  for (const environment of [
    { E2E_ALLOW_SHARED_TABLES: "" }, { E2E_ALLOW_SHARED_TABLES: "true" }, { E2E_ALLOW_SHARED_TABLES: " 1" },
    { APP_ENV: "production" }, { AUTH_MODE: "cognito" }, { AWS_REGION: "" },
    { DYNAMODB_ENDPOINT: "http://127.0.0.1:18000", DYNAMODB_PORT: "18001" },
    { API_PORT: "14000junk" }, { API_PORT: "15173" }, { PUBLIC_BASE_URL: "http://example.com" },
    { E2E_ALLOW_SHARED_TABLES: "1" }, { E2E_ALLOW_SHARED_TABLES: "1", CI: "0" },
    { E2E_ALLOW_SHARED_TABLES: "1", SMOKE_RUN_MANIFEST_PATH: "manifest.json" }
  ]) assert.throws(() => resolveE2EConfiguration(environment, newRunId()));
  assert.throws(() => e2eTableNames("20260230t123456789z-0123456789abcdef0123456789abcdef"), /timestamp/);
  assert.throws(() => e2eTableNames("20261006t246000000z-0123456789abcdef0123456789abcdef"), /timestamp/);
});

test("exclusive provision journals intent per role, normal schemas, verified markers and creation identity without changing retained tables", async (t) => {
  const { config, file, client } = await fixture(t, { AWS_REGION: "us-east-1" });
  for (const name of ["invite-agent-local-app", "invite-agent-local-audit", "custom-app", "custom-audit", "another-run-app"]) client.tables.set(name, { data: ["preserve", name] });
  const before = structuredClone([...client.tables]);
  client.beforeSend = async (command) => {
    if (command.constructor.name !== "CreateTableCommand") return;
    const manifest = await readE2EManifest(file);
    const table = manifest.tables.find(({ name }) => name === command.input.TableName);
    assert.equal(table.creationAttempted, true);
    if (table.role === "app") assert.equal(manifest.tables[1].creationAttempted, false);
  };
  await provisionE2ETables(file, client);
  const manifest = await readE2EManifest(file);
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.owner, "invite-a-gent-local-e2e");
  assert.ok(manifest.tables.every((table) => table.owned && table.creationIdentity.creationDateTime === Date.parse("2026-10-06T12:00:00.000Z")));
  assert.deepEqual([...client.tables].filter(([name]) => ![config.appTableName, config.auditTableName].includes(name)), before);
  const creates = client.calls.filter(({ type }) => type === "CreateTableCommand");
  assert.equal(creates.length, 2);
  assert.equal(creates[0].GlobalSecondaryIndexes[0].Projection.ProjectionType, "ALL");
  assert.equal(creates[1].GlobalSecondaryIndexes, undefined);
  await verifyE2EOwnership(client, manifest);
  await assert.rejects(provisionE2ETables(file, client), /reprovision/);
  assert.ok(!client.calls.some(({ type }) => ["DeleteTableCommand", "ScanCommand", "UpdateTableCommand"].includes(type)));
  assert.ok(!(await readFile(file, "utf8")).includes("PUBLIC_TOKEN_HASH_KEY"));
});

test("pair collision is read-only and exclusive creation rejects a race without adopting its marker", async (t) => {
  for (const role of [0, 1]) {
    const { file, manifest, client } = await fixture(t);
    client.tables.set(manifest.tables[role].name, { foreign: "retained" });
    const before = structuredClone([...client.tables]);
    await assert.rejects(provisionE2ETables(file, client), /collision/);
    assert.deepEqual([...client.tables], before);
    assert.ok(client.calls.every(({ type }) => type === "DescribeTableCommand"));
    assert.ok((await readE2EManifest(file)).tables.every(({ creationAttempted }) => !creationAttempted));
  }
  const { file, manifest, client } = await fixture(t);
  client.beforeSend = (command) => { if (command.constructor.name === "CreateTableCommand") client.tables.set(command.input.TableName, { foreign: "racing writer" }); };
  await assert.rejects(provisionE2ETables(file, client), /race collision/);
  assert.deepEqual(client.tables.get(manifest.tables[0].name), { foreign: "racing writer" });
  assert.equal(client.calls.some(({ type }) => type === "PutItemCommand"), false);
});

test("partial provisioning and lost marker acknowledgement retain truthful evidence; no automatic adoption", async (t) => {
  for (const fault of ["audit-create", "marker"]) {
    const { file, manifest, client } = await fixture(t);
    client.beforeSend = (command) => {
      if ((fault === "audit-create" && command.constructor.name === "CreateTableCommand" && command.input.TableName === manifest.tables[1].name) || (fault === "marker" && command.constructor.name === "PutItemCommand")) throw new Error(fault);
    };
    await assert.rejects(provisionE2ETables(file, client), new RegExp(fault));
    const saved = await readE2EManifest(file);
    assert.equal(saved.tables[0].creationAttempted, true);
    assert.equal(saved.tables[0].owned, fault === "audit-create");
    assert.equal(saved.tables[1].creationAttempted, fault === "audit-create");
    assert.equal(saved.tables[1].owned, false);
    assert.equal(client.calls.some(({ type }) => type === "DeleteTableCommand"), false);
  }
});

test("manifest/name/schema/nonce/creation-identity drift refuses before any helper writes", async (t) => {
  const { file, manifest, client } = await fixture(t);
  for (const mutate of [
    (m) => { m.schemaVersion = 1; }, (m) => { delete m.services; },
    (m) => { m.tables[0].name = "invite-agent-local-app"; },
    (m) => { m.tables[1].name = "invite-agent-local-app"; },
    (m) => { m.tables[0].name = "custom-persistent-app"; },
    (m) => { m.tables[0].name = m.tables[1].name; },
    (m) => { m.endpoint = "http://remote:18000"; }, (m) => { m.configuration.apiPort = 14001; }
  ]) {
    const invalid = structuredClone(manifest); mutate(invalid);
    await writeFile(file, JSON.stringify(invalid));
    await assert.rejects(provisionE2ETables(file, client));
    assert.equal(client.calls.length, 0);
  }
  await writeFile(file, JSON.stringify(manifest));
  await provisionE2ETables(file, client);
  const saved = await readE2EManifest(file);
  const table = client.tables.get(saved.tables[0].name);
  const original = structuredClone(table);
  for (const mutate of [
    (value) => { value.marker.nonce.S = "wrong"; }, (value) => { value.marker.role.S = "audit"; },
    (value) => { value.schema.CreationDateTime = new Date(); },
    (value) => { value.schema.GlobalSecondaryIndexes[0].Projection.ProjectionType = "KEYS_ONLY"; },
    (value) => { value.schema.AttributeDefinitions[0].AttributeType = "N"; }
  ]) {
    client.tables.set(saved.tables[0].name, structuredClone(original));
    mutate(client.tables.get(saved.tables[0].name));
    await assert.rejects(verifyE2EOwnership(client, saved), /mismatch/);
  }
  const names = client.calls.filter(({ type }) => type !== "DescribeTableCommand").map(({ TableName }) => TableName);
  assert.ok(names.every((name) => saved.tables.some((entry) => entry.name === name)));
});

test("manifest creation and intent persistence failures block new resource writes", async (t) => {
  const { config, file, manifest, client } = await fixture(t);
  await assert.rejects(createE2EManifest(config, manifest.coordinator, []), /EEXIST/);
  // A lost manifest between preflight and intent save cannot authorize creation.
  client.beforeSend = async (command) => {
    if (command.constructor.name === "DescribeTableCommand" && command.input.TableName === manifest.tables[1].name) {
      await rm(file);
      await mkdir(file);
    }
  };
  await assert.rejects(provisionE2ETables(file, client));
  assert.ok(client.calls.every(({ type }) => type === "DescribeTableCommand"));
});

test("shared preflight verifies both API and proxy, hash consistency and stable instance without leaking the key", async () => {
  const config = resolveE2EConfiguration({ E2E_ALLOW_SHARED_TABLES: "1", APP_ENV: "local", DYNAMODB_ENDPOINT: "http://127.0.0.1:18000", APP_TABLE_NAME: "caller-app", AUDIT_TABLE_NAME: "caller-audit" });
  const environment = e2eEnvironment(config, { PUBLIC_TOKEN_HASH_KEY: "test-key-never-reported" });
  const attestation = createE2EAttestation(config, environment.PUBLIC_TOKEN_HASH_KEY);
  const urls = [];
  const fakeFetch = async (url, options) => {
    urls.push(url); assert.equal(options.redirect, "error");
    return { ok: true, json: async () => attestation.response(new URL(url).searchParams.get("challenge")) };
  };
  await preflightE2E(environment, fakeFetch);
  assert.deepEqual(urls.map((url) => new URL(url).origin), [config.apiOrigin, config.webOrigin]);
  assert.equal(environment.E2E_API_INSTANCE_ID, attestation.instanceId);
  assert.ok(!JSON.stringify(attestation.response("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")).includes(environment.PUBLIC_TOKEN_HASH_KEY));
  for (const field of ["mode", "runId", "endpoint", "region", "appTableName", "auditTableName", "publicBaseUrl", "hashKeyProof", "instanceId"]) {
    await assert.rejects(preflightE2E(environment, async (url) => ({ ok: true, json: async () => ({ ...attestation.response(new URL(url).searchParams.get("challenge")), [field]: "wrong" }) })), /mismatch|instance/);
  }
  await assert.rejects(preflightE2E(environment, async () => ({ ok: false })), /unavailable/);
});

test("occupied API/web port is refused without stopping or writing to the caller server", async (t) => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await assert.rejects(assertFreePort(server.address().port), /occupied/);
  assert.equal(server.listening, true);
});

test("API child rejects missing/unsafe E2E context before DynamoDB initialization", () => {
  for (const override of [{ APP_ENV: "production" }, { DYNAMODB_ENDPOINT: "http://remote:18000" }, { APP_TABLE_NAME: "invite-agent-local-app" }]) {
    const config = resolveE2EConfiguration({}, newRunId());
    config.manifestPath = path.resolve(".devstack/e2e-runs", config.runId, "manifest.json");
    const environment = { ...e2eEnvironment(config, process.env), ...override };
    const result = spawnSync(process.execPath, ["backend/dist/adapters/local/dev-server.js"], { env: environment, encoding: "utf8", timeout: 10_000, windowsHide: true });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /requires|drift/);
    assert.doesNotMatch(result.stderr, /ECONNREFUSED|CreateTable|Migration/);
  }
});
