import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";
import { clearAllLocalData, readOptions } from "../../scripts/clear-all-local-data.mjs";

const shared = ["invite-agent-local-app", "invite-agent-local-audit"];
const run = "20261003t123456789z-0123456789abcdef0123456789abcdef";
const uuid = "01234567-89ab-4def-8123-456789abcdef";
const targets = [...shared, ...["app", "audit"].map((role) => `invite-agent-smoke-${role}-${run}`),
  ...["app", "audit"].map((role) => `invite-agent-test-${role}-${uuid}`)];
const excluded = ["other-app", "invite-agent-local-app-backup", "invite-agent-smoke-app-other",
  `invite-agent-test-app-${uuid}-backup`, "invite-agent-test-app-123-1728000000000"];
const env = { APP_ENV: "test", DYNAMODB_ENDPOINT: "http://localhost:18000" };
const schema = () => ({ TableStatus: "ACTIVE", CreationDateTime: new Date(123456),
  KeySchema: [{ AttributeName: "PK", KeyType: "HASH" }, { AttributeName: "SK", KeyType: "RANGE" }],
  AttributeDefinitions: [{ AttributeName: "PK", AttributeType: "S" }, { AttributeName: "SK", AttributeType: "S" }] });

function fixture(names = [...targets, ...excluded]) {
  const tables = new Map(names.map((name) => [name, { schema: schema(), items: ["retained sentinel"] }]));
  const calls = [];
  const reports = [];
  const client = { tables, calls, before: undefined, destroyed: false,
    destroy() { this.destroyed = true; },
    async send(command) {
      const type = command.constructor.name;
      const input = command.input;
      calls.push({ type, ...input });
      const overridden = await client.before?.(type, input);
      if (overridden !== undefined) return overridden;
      if (type === "ListTablesCommand") {
        const names = [...tables.keys()].sort();
        const start = input.ExclusiveStartTableName ? names.indexOf(input.ExclusiveStartTableName) + 1 : 0;
        const page = names.slice(start, start + 2);
        return { TableNames: page, ...(start + 2 < names.length ? { LastEvaluatedTableName: page.at(-1) } : {}) };
      }
      if (!tables.has(input.TableName)) throw Object.assign(new Error("missing"), { name: "ResourceNotFoundException" });
      if (type === "DescribeTableCommand") return { Table: tables.get(input.TableName).schema };
      if (type === "DeleteTableCommand") { tables.delete(input.TableName); return {}; }
      throw new Error(`Unexpected command ${type}`);
    }
  };
  const invoke = (argv = [], extra = {}) => clearAllLocalData({ argv, env,
    createClient: (endpoint) => { assert.equal(endpoint, "http://127.0.0.1:18000"); return client; },
    emit: (report) => reports.push(report), ...extra });
  return { client, reports, invoke };
}
const deletes = (client) => client.calls.filter(({ type }) => type === "DeleteTableCommand");

test("default/explicit previews paginate all names, classify exact targets and preserve all records", async () => {
  for (const args of [[], ["--dry-run"]]) {
    const { client, reports, invoke } = fixture();
    const before = structuredClone(client.tables);
    const result = await invoke(args);
    assert.equal(result.dryRun, true);
    assert.deepEqual(result.summary, { ready: 6, deleted: 0, skipped: 5, failed: 0 });
    assert.deepEqual(client.tables, before);
    assert.equal(deletes(client).length, 0);
    assert.equal(reports.length, 1);
    assert.equal(client.calls.filter(({ type }) => type === "ListTablesCommand").length, 6);
    assert.equal(client.calls.some(({ type, TableName }) => type === "DescribeTableCommand" && excluded.includes(TableName)), false);
    assert.equal(client.destroyed, true);
  }
});

test("phrase and force delete shared/smoke/test tables including empty tables, preserving exclusions", async () => {
  for (const args of [["--force"], ["--confirm", "DELETE ALL LOCAL DATA"]]) {
    const { client, reports, invoke } = fixture();
    client.tables.get(shared[0]).items = [];
    const before = structuredClone(new Map([...client.tables].filter(([name]) => excluded.includes(name))));
    client.before = (type) => { if (type === "DeleteTableCommand") assert.equal(reports[0].phase, "preview"); };
    const result = await invoke(args);
    assert.deepEqual(result.summary, { ready: 0, deleted: 6, skipped: 5, failed: 0 });
    assert.deepEqual(client.tables, before);
    assert.equal(reports[0].summary.ready, 6);
    assert.equal(reports[1].phase, "result");
    const rerun = await invoke(args);
    assert.equal(rerun.summary.deleted, 0);
    assert.equal(rerun.summary.skipped, 7);
    assert.equal(rerun.status, "complete");
  }
});

test("an empty database reports absent shared tables without deleting", async () => {
  const { invoke, client } = fixture([]);
  const result = await invoke(["--force"]);
  assert.deepEqual(result.summary, { ready: 0, deleted: 0, skipped: 2, failed: 0 });
  assert.equal(deletes(client).length, 0);
});

test("invalid arguments and configuration refuse before constructing a client, including force", async () => {
  const invalidArgs = [["--all"], ["--confirm"], ["--confirm", "yes"], ["--endpoint"],
    ["--force", "--dry-run"], ["--force", "--confirm", "DELETE ALL LOCAL DATA"],
    ["--force", "--force"], ["--help", "--force"], ["--endpoint", env.DYNAMODB_ENDPOINT, "--endpoint", env.DYNAMODB_ENDPOINT]];
  const invalidEnv = [{ APP_ENV: undefined }, { APP_ENV: "production" }, { APP_ENV: "" },
    { APP_TABLE_NAME: "production-app" }, { AUDIT_TABLE_NAME: "" }, { DYNAMODB_ENDPOINT: undefined }];
  for (const [argv, overrides] of [...invalidArgs.map((args) => [args, {}]), ...invalidEnv.map((value) => [["--force"], value])]) {
    await assert.rejects(clearAllLocalData({ argv, env: { ...env, ...overrides }, createClient: () => assert.fail("must not connect") }));
  }
  assert.equal(readOptions(["--help"], {}).help, true);
  assert.equal(readOptions(["--endpoint", "http://127.0.0.1:12345/"], env).endpoint, "http://127.0.0.1:12345");
});

test("non-local, ambiguous and malformed endpoints are rejected before all network access", async () => {
  for (const endpoint of ["https://dynamodb.eu-west-2.amazonaws.com", "http://example.test:18000",
    "http://127.0.0.1", "http://127.0.0.1:80", "http://localhost:0", "http://localhost:65536",
    "http://localhost:18000/path", "http://user:pass@localhost:18000", "http://localhost:18000?x=1",
    "http://localhost:18000#x", "http://[::1]:18000", "http://127.1:18000", "http://2130706433:18000",
    "http://localhost.example:18000", "https://localhost:18000", "not a URL", " http://localhost:18000"]) {
    await assert.rejects(clearAllLocalData({ argv: ["--endpoint", endpoint, "--force"], env,
      createClient: () => assert.fail("must not connect") }), /loopback/);
  }
});

test("discovery failure on a later page and schema/state/identity refusal prevent every delete", async () => {
  for (const fault of ["listing", "schema", "state", "identity", "describe", "pagination"]) {
    const { client, invoke } = fixture();
    if (fault === "schema") client.tables.get(shared[1]).schema.KeySchema = [];
    if (fault === "state") client.tables.get(shared[1]).schema.TableStatus = "CREATING";
    if (fault === "identity") delete client.tables.get(shared[1]).schema.CreationDateTime;
    client.before = (type, input) => {
      if (fault === "listing" && type === "ListTablesCommand" && input.ExclusiveStartTableName) throw new Error("listing failure");
      if (fault === "describe" && type === "DescribeTableCommand" && input.TableName === shared[1]) throw new Error("read failure");
      if (fault === "pagination" && type === "ListTablesCommand") return { TableNames: shared, LastEvaluatedTableName: shared[1] };
    };
    assert.equal((await invoke(["--force"])).status, "failed", fault);
    assert.equal(deletes(client).length, 0, fault);
  }
});

test("replacement tables are refused and newly appearing names are never adopted", async () => {
  const { client, reports, invoke } = fixture(shared);
  const result = await invoke(["--force"], { emit: (report) => {
    reports.push(report);
    if (report.phase === "preview") {
      client.tables.get(shared[0]).schema.CreationDateTime = new Date(999999);
      client.tables.set(targets[2], { schema: schema(), items: ["new"] });
    }
  } });
  assert.equal(result.status, "failed");
  assert.match(result.tables.find(({ name }) => name === shared[0]).reason, /replacement/);
  assert.deepEqual([...client.tables.keys()], [shared[0], targets[2]]);
});

test("partial failures continue other targets and rerun finishes only remaining tables", async () => {
  const { client, invoke } = fixture();
  client.before = (type, input) => { if (type === "DeleteTableCommand" && input.TableName === shared[0]) throw new Error("forced deletion failure"); };
  const result = await invoke(["--force"]);
  assert.equal(result.status, "failed");
  assert.equal(result.summary.deleted, 5);
  assert.equal(result.summary.failed, 1);
  client.before = undefined;
  assert.equal((await invoke(["--force"])).summary.deleted, 1);
  assert.deepEqual([...client.tables.keys()], excluded);
});

test("tables disappearing after preview are skips and output failure prevents any mutation", async () => {
  const { client, invoke } = fixture(shared);
  const result = await invoke(["--force"], { emit: (report) => {
    if (report.phase === "preview") client.tables.delete(shared[0]);
  } });
  assert.equal(result.summary.skipped, 1);
  assert.equal(result.summary.deleted, 1);
  const failed = fixture();
  await assert.rejects(failed.invoke(["--force"], { emit: () => { throw new Error("output unavailable"); } }), /output unavailable/);
  assert.equal(deletes(failed.client).length, 0);
  assert.equal(failed.client.destroyed, true);
});

test("real SDK refuses redirects without contacting their destination", async (t) => {
  let destinationCalls = 0;
  const destination = createServer((_req, res) => { destinationCalls += 1; res.end("unexpected"); });
  await new Promise((resolve) => destination.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => destination.close(resolve)));
  const redirect = createServer((_req, res) => {
    res.writeHead(307, { Location: `http://127.0.0.1:${destination.address().port}` });
    res.end();
  });
  await new Promise((resolve) => redirect.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => redirect.close(resolve)));
  const result = await clearAllLocalData({ argv: ["--endpoint", `http://127.0.0.1:${redirect.address().port}`, "--force"], env });
  assert.equal(result.status, "failed");
  assert.equal(destinationCalls, 0);
});

test("CLI help and refusal exit codes are explicit without accessing a database", () => {
  const invoke = (args) => spawnSync(process.execPath, ["scripts/clear-all-local-data.mjs", ...args], {
    env: { ...process.env, APP_ENV: "production" }, encoding: "utf8", timeout: 5000
  });
  assert.equal(invoke(["--help"]).status, 0);
  const result = invoke(["--force"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /APP_ENV/);
  assert.equal(result.stdout, "");
});
