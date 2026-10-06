import { createHmac, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DescribeTableCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { assertEffectiveEnvironment, resolveE2EConfiguration, type E2EConfiguration } from "./e2e-config.js";
import { assertTableSchema, e2eClient, readE2EManifest, verifyE2EOwnership } from "./e2e-resources.js";

export async function processStartTime(pid: number): Promise<string> {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error("Invalid E2E process identity");
  const { stdout } = await promisify(execFile)("pwsh", ["-NoProfile", "-Command", `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToFileTimeUtc().ToString()`], { windowsHide: true, timeout: 5000 });
  const value = stdout.trim();
  if (!/^\d+$/.test(value)) throw new Error("Cannot establish E2E process start time");
  return value;
}

export function effectiveE2EConfiguration(environment: NodeJS.ProcessEnv): E2EConfiguration {
  const config = resolveE2EConfiguration(environment);
  assertEffectiveEnvironment(config, environment);
  if (config.mode === "isolated" && !config.manifestPath) throw new Error("E2E requires its current run manifest");
  return config;
}

export async function verifyE2ETargets(environment: NodeJS.ProcessEnv): Promise<E2EConfiguration> {
  const config = effectiveE2EConfiguration(environment);
  if (config.mode === "shared") return config;
  const client = e2eClient(config);
  try {
    if (config.mode === "isolated") {
      const manifest = await readE2EManifest(config.manifestPath!);
      if (JSON.stringify(config) !== JSON.stringify(manifest.configuration)) throw new Error("E2E API/helper targets differ from manifest");
      if (!["starting", "testing"].includes(manifest.phase) || !manifest.tables.every((table) => table.owned && table.creationIdentity && table.cleanup === "pending")) throw new Error("E2E run is not ready for writers");
      if (String(manifest.coordinator.pid) !== environment.E2E_COORDINATOR_PID || await processStartTime(manifest.coordinator.pid) !== manifest.coordinator.startTimeUtcFileTime) throw new Error("E2E coordinator is stale or mismatched");
      await verifyE2EOwnership(client, manifest);
    } else {
      // Smoke v1 stays with its existing parser/family and wrapper lifecycle.
      const moduleUrl = pathToFileURL(path.resolve("scripts/smoke-run-resources.mjs")).href;
      const { readManifest } = await import(moduleUrl);
      const manifest = await readManifest(config.manifestPath);
      if (manifest.endpoint !== config.endpoint || manifest.region !== config.region || manifest.tables[0].name !== config.appTableName || manifest.tables[1].name !== config.auditTableName) throw new Error("Smoke API/helper targets differ from manifest");
      if (!environment.E2E_SMOKE_COORDINATOR_PID || !environment.E2E_SMOKE_COORDINATOR_START || await processStartTime(Number(environment.E2E_SMOKE_COORDINATOR_PID)) !== environment.E2E_SMOKE_COORDINATOR_START) throw new Error("Smoke requires its live wrapper coordinator");
      for (const table of manifest.tables) {
        const { Table } = await client.send(new DescribeTableCommand({ TableName: table.name }));
        assertTableSchema(Table, table.role);
        const { Item } = await client.send(new GetItemCommand({ TableName: table.name, Key: { PK: { S: "SMOKE_RUN#OWNERSHIP" }, SK: { S: "METADATA" } }, ConsistentRead: true }));
        if (!Item || Item.owner?.S !== "invite-a-gent-local-smoke" || Item.runId?.S !== manifest.runId || Item.nonce?.S !== manifest.ownershipNonce || Item.role?.S !== table.role) throw new Error(`Smoke ownership marker mismatch: ${table.name}`);
      }
    }
  } finally { client.destroy(); }
  return config;
}

export function hashKeyProof(key: string, challenge: string): string {
  return createHmac("sha256", key).update(challenge).digest("hex");
}

export function createE2EAttestation(config: E2EConfiguration, key: string) {
  const instanceId = randomUUID();
  return { instanceId, response(challenge: string) {
    if (!/^[a-f0-9-]{36}$/.test(challenge)) throw new Error("Invalid E2E attestation challenge");
    return { ...config, instanceId, hashKeyProof: hashKeyProof(key, challenge) };
  } };
}

export async function preflightE2E(environment: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch): Promise<E2EConfiguration> {
  const config = await verifyE2ETargets(environment);
  const challenge = randomUUID();
  let instance: string | undefined;
  for (const origin of [config.apiOrigin, config.webOrigin]) {
    const response = await fetcher(`${origin}/health/e2e?challenge=${challenge}`, { redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`E2E configuration attestation unavailable at ${origin}`);
    const actual = await response.json() as Record<string, unknown>;
    for (const [key, expected] of Object.entries(config)) if (actual[key] !== expected) throw new Error(`E2E API/proxy attestation mismatch: ${key} at ${origin}`);
    if (actual.hashKeyProof !== hashKeyProof(environment.PUBLIC_TOKEN_HASH_KEY!, challenge)) throw new Error("E2E API/helper hash configuration mismatch");
    if (typeof actual.instanceId !== "string" || !/^[a-f0-9-]{36}$/.test(actual.instanceId)) throw new Error("E2E API instance missing");
    if ((instance && instance !== actual.instanceId) || (environment.E2E_API_INSTANCE_ID && environment.E2E_API_INSTANCE_ID !== actual.instanceId)) throw new Error("E2E API instance changed or proxy targets another API");
    instance = actual.instanceId;
  }
  environment.E2E_API_INSTANCE_ID = instance;
  return config;
}
