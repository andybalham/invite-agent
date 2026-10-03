import assert from "node:assert/strict";
import test from "node:test";
import { memoryClient } from "../support/cleanup-fixture.mjs";
import { createIntegrationApp, ownedTables } from "../support/integration-fixture.mjs";

const config = { appTableName: "invite-agent-test-app-owned", auditTableName: "invite-agent-test-audit-owned" };

test("owned integration tables clean up twice without touching local, smoke or pre-existing test tables", async () => {
  const client = memoryClient();
  const unrelated = ["invite-agent-local-app", "invite-agent-smoke-app-other", "invite-agent-test-app-other"];
  for (const name of unrelated) client.seed(name, []);
  const tables = ownedTables(client);
  await tables.initialize(config);
  await tables.cleanup();
  await tables.cleanup();
  assert.deepEqual([...client.tables.keys()], unrelated);
  assert.equal(client.calls.filter(({ type }) => type === "DeleteTableCommand").length, 2);
});

for (const failure of ["second creation", "readiness"]) {
  test(`partial setup cleans successful creations after ${failure} failure`, async () => {
    const client = memoryClient();
    client.beforeSend = async (command) => {
      if ((failure === "second creation" && command.constructor.name === "CreateTableCommand" && command.input.TableName === config.auditTableName) ||
          (failure === "readiness" && command.constructor.name === "DescribeTableCommand")) throw new Error("forced setup failure");
    };
    const tables = ownedTables(client);
    await assert.rejects(tables.initialize(config), /forced setup failure/);
    client.beforeSend = undefined;
    await tables.cleanup();
    assert.equal(client.tables.size, 0);
  });
}

test("exclusive creation never adopts a colliding table, but still clears the first successful creation", async () => {
  const client = memoryClient();
  client.seed(config.auditTableName, []);
  const tables = ownedTables(client);
  await assert.rejects(tables.initialize(config), { name: "ResourceInUseException" });
  await tables.cleanup();
  assert.deepEqual([...client.tables.keys()], [config.auditTableName]);
});

test("cleanup attempts both tables and retries only failed deletions; missing tables are harmless", async () => {
  const client = memoryClient();
  const tables = ownedTables(client);
  await tables.initialize(config);
  client.beforeSend = async (command) => {
    if (command.constructor.name === "DeleteTableCommand" && command.input.TableName === config.appTableName) throw new Error("forced delete failure");
  };
  await assert.rejects(tables.cleanup(), /forced delete failure/);
  assert.deepEqual([...client.tables.keys()], [config.appTableName]);
  client.beforeSend = undefined;
  client.tables.delete(config.appTableName);
  await tables.cleanup();
  await tables.cleanup();
  assert.equal(client.tables.size, 0);
});

test("fixture registers teardown before setup and closes server, tables and clients despite failures", async () => {
  const client = memoryClient();
  const order = [];
  const hooks = [];
  const diagnostics = [];
  client.destroy = () => order.push("client");
  const t = { after: (hook) => hooks.push(hook), diagnostic: (message) => diagnostics.push(message) };
  const apps = [];
  for (let index = 0; index < 2; index += 1) {
    apps.push(await createIntegrationApp(t, async (actual) => {
      assert.equal(hooks.length, index + 1);
      return { config: actual, dispose: () => { order.push("app"); throw new Error("dispose failed"); } };
    }, { ...config, dynamodbEndpoint: "http://127.0.0.1:18000" }, {
      client, beforeCleanup: [() => { order.push("server"); throw new Error("close failed"); }]
    }));
  }
  assert.notEqual(apps[0].config.appTableName, apps[1].config.appTableName);
  for (const hook of hooks) await assert.rejects(hook(), /close failed; dispose failed/);
  assert.equal(client.tables.size, 0);
  assert.deepEqual(order, ["server", "app", "client", "server", "app", "client"]);
  assert.equal(diagnostics.length, 4);
});
