import assert from "node:assert/strict";
import test from "node:test";
import { createLocalComposition } from "../../backend/dist/adapters/local/composition.js";
import { createIntegrationApp, integrationClient } from "./integration-fixture.mjs";
import { seedDashboard } from "./my-polls-fixture.mjs";

const mode = process.env.INTEGRATION_FAILURE_MODE;
const endpoint = process.env.DYNAMODB_ENDPOINT;
test(`forced integration ${mode}`, async (t) => {
  const client = integrationClient(endpoint);
  const send = client.send.bind(client);
  let creates = 0;
  client.send = async (command) => {
    if (command.constructor.name === "CreateTableCommand" && ++creates === 2 && mode === "setup") {
      throw new Error("ORIGINAL_SETUP_FAILURE");
    }
    const result = await send(command);
    if (command.constructor.name === "CreateTableCommand") t.diagnostic(`OWNED_TABLE:${command.input.TableName}`);
    if (command.constructor.name === "DeleteTableCommand" && mode.includes("cleanup")) {
      // Simulate a lost response after deletion without leaking resources.
      throw new Error("SECONDARY_CLEANUP_FAILURE");
    }
    return result;
  };
  const app = await createIntegrationApp(t, createLocalComposition, {
    appEnv: "test", authMode: "local", awsRegion: "eu-west-2", dynamodbEndpoint: endpoint,
    publicBaseUrl: "http://127.0.0.1:15173"
  }, { client });
  if (mode === "dashboard") await seedDashboard(app);
  if (mode !== "cleanup-only") assert.fail("ORIGINAL_ASSERTION_FAILURE");
});
