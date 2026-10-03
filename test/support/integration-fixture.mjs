import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { validateLocalEndpoint } from "../../scripts/cleanup-local-data.mjs";
import { deleteOwnedTable } from "../../scripts/smoke-run-resources.mjs";
import { initializeTables } from "../../backend/dist/data/initialize-tables.js";

export function integrationClient(endpoint) {
  return new DynamoDBClient({
    endpoint: validateLocalEndpoint(endpoint), region: "eu-west-2",
    credentials: { accessKeyId: "local", secretAccessKey: "local" }, maxAttempts: 2,
    requestHandler: { connectionTimeout: 2000, requestTimeout: 5000 }
  });
}

// Node runs after hooks on setup/assertion failure and retains the original error.
// Diagnostics make secondary failures visible even when the hook error is secondary.
export function registerTeardown(t, steps) {
  t.after(async () => {
    const errors = [];
    for (const step of steps) {
      try { await step(); }
      catch (error) { errors.push(error); t.diagnostic(`Integration cleanup failed: ${error.message}`); }
    }
    if (errors.length) throw new AggregateError(errors, errors.map((error) => error.message).join("; "));
  });
}

export function ownedTables(client) {
  const owned = new Set();
  return {
    async initialize(config) {
      // Record the successful CreateTable response before any readiness check can fail.
      const trackingClient = { async send(command) {
        const result = await client.send(command);
        if (command.constructor.name === "CreateTableCommand") owned.add(command.input.TableName);
        return result;
      } };
      await initializeTables(trackingClient, config, { exclusive: true });
    },
    async cleanup() {
      const errors = [];
      for (const name of owned) {
        try { await deleteOwnedTable(client, name); owned.delete(name); }
        catch (error) { errors.push(new Error(`${name}: ${error.message}`, { cause: error })); }
      }
      if (errors.length) throw new AggregateError(errors, errors.map((error) => error.message).join("; "));
    }
  };
}

export async function createIntegrationApp(t, compose, config, { beforeCleanup = [], client } = {}) {
  const suffix = randomUUID();
  const ownedConfig = {
    ...config,
    dynamodbEndpoint: validateLocalEndpoint(config.dynamodbEndpoint),
    appTableName: `invite-agent-test-app-${suffix}`,
    auditTableName: `invite-agent-test-audit-${suffix}`
  };
  const cleanupClient = client ?? integrationClient(ownedConfig.dynamodbEndpoint);
  const tables = ownedTables(cleanupClient);
  let app;
  // Register before composition and before the first table-creation attempt.
  registerTeardown(t, [
    ...beforeCleanup, () => tables.cleanup(), () => app?.dispose(), () => cleanupClient.destroy()
  ]);
  app = await compose(ownedConfig);
  await tables.initialize(ownedConfig);
  return app;
}
