import { randomUUID } from "node:crypto";
import { readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DynamoDBClient, DescribeTableCommand, GetItemCommand, PutItemCommand, type TableDescription, type AttributeValue } from "@aws-sdk/client-dynamodb";
import { initializeTables } from "../../data/initialize-tables.js";
import { e2eTableNames, localEndpoint, resolveE2EConfiguration, type E2EConfiguration } from "./e2e-config.js";

const owner = "invite-a-gent-local-e2e";
const markerKey = { PK: { S: "E2E_RUN#OWNERSHIP" }, SK: { S: "METADATA" } };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export interface ProcessIdentity {
  pid: number;
  startTimeUtcFileTime: string;
  runId: string;
  manifestPath: string;
  role?: string;
}
export interface CreationIdentity { creationDateTime: number; tableId?: string }
export interface CleanupAttempt {
  attemptId: string;
  startedAt: string;
  finishedAt: string | null;
  origin: "automatic" | "recovery";
  outcome: "complete" | "failed" | "interrupted" | null;
  interruption: string | null;
  phases: { writers: string[]; tables: string[]; diagnostics: string[]; dynamodb: "reused" };
  tables: { role: string; name: string; observation: string; error: string | null }[];
}
export interface E2ETable {
  role: "app" | "audit";
  name: string;
  creationAttempted: boolean;
  owned: boolean;
  creationIdentity: CreationIdentity | null;
  deletionAttempted: boolean;
  deletionRequestedAt: string | null;
  cleanup: "pending" | "deleted" | "absent" | "failed";
  cleanupError: string | null;
}
export interface E2EManifest {
  schemaVersion: 2;
  owner: string;
  mode: "isolated";
  runId: string;
  ownershipNonce: string;
  createdAt: string;
  endpoint: string;
  region: string;
  configuration: E2EConfiguration;
  suite: string[];
  startedAt: string;
  finishedAt: string | null;
  phase: "prepared" | "provisioning" | "starting" | "testing" | "teardown" | "finished" | "interrupted";
  pollIds: string[];
  tables: E2ETable[];
  coordinator: ProcessIdentity;
  services: { processes: ProcessIdentity[]; dynamodb: { state: "reused"; endpoint: string } };
  cleanupAttempts: CleanupAttempt[];
  cleanupFinishedAt: string | null;
}

export function e2eClient(config: Pick<E2EConfiguration, "endpoint" | "region">): DynamoDBClient {
  return new DynamoDBClient({
    endpoint: localEndpoint(config.endpoint), region: config.region,
    credentials: { accessKeyId: "local", secretAccessKey: "local" }, maxAttempts: 2,
    requestHandler: { connectionTimeout: 2000, requestTimeout: 5000 }
  });
}

function processIdentity(value: ProcessIdentity, runId: string, file: string): boolean {
  return value && Number.isInteger(value.pid) && value.pid > 0 && /^\d+$/.test(value.startTimeUtcFileTime) && value.runId === runId && value.manifestPath === file;
}
function iso(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
export function validateE2EManifest(manifest: E2EManifest): E2EManifest {
  const names = e2eTableNames(manifest?.runId);
  const config = manifest.configuration;
  const file = config?.manifestPath;
  const resolved = config && resolveE2EConfiguration({
    APP_ENV: config.appEnv, AUTH_MODE: config.authMode, DYNAMODB_ENDPOINT: manifest.endpoint,
    AWS_REGION: manifest.region, API_PORT: String(config.apiPort), WEB_PORT: String(config.webPort),
    DYNAMODB_PORT: String(config.dynamodbPort), PUBLIC_BASE_URL: config.publicBaseUrl, E2E_RUN_MANIFEST_PATH: file ?? ""
  }, manifest.runId);
  if (manifest.schemaVersion !== 2 || manifest.owner !== owner || manifest.mode !== "isolated" || !uuid.test(manifest.ownershipNonce) ||
      !iso(manifest.createdAt) || !iso(manifest.startedAt) || (manifest.finishedAt !== null && !iso(manifest.finishedAt)) ||
      manifest.endpoint !== localEndpoint(manifest.endpoint) || !manifest.region?.trim() || !file || !path.isAbsolute(file) ||
      !resolved || Object.keys(resolved).some((key) => config[key as keyof E2EConfiguration] !== resolved[key as keyof E2EConfiguration]) ||
      Object.keys(config).some((key) => !(key in resolved)) ||
      !["prepared", "provisioning", "starting", "testing", "teardown", "finished", "interrupted"].includes(manifest.phase) ||
      !Array.isArray(manifest.suite) || !manifest.suite.every((s) => typeof s === "string") ||
      !Array.isArray(manifest.pollIds) || !manifest.pollIds.every((id) => uuid.test(id)) || new Set(manifest.pollIds).size !== manifest.pollIds.length ||
      !Array.isArray(manifest.tables) || manifest.tables.length !== 2 || !manifest.tables.every((table, index) =>
        table?.role === ["app", "audit"][index] && table.name === names[table.role] &&
        typeof table.creationAttempted === "boolean" && typeof table.owned === "boolean" && typeof table.deletionAttempted === "boolean" &&
        (table.creationIdentity === null || (Number.isFinite(table.creationIdentity?.creationDateTime) && table.creationIdentity!.creationDateTime > 0 && (table.creationIdentity!.tableId === undefined || typeof table.creationIdentity!.tableId === "string"))) &&
        (table.deletionRequestedAt === null || iso(table.deletionRequestedAt)) && ["pending", "deleted", "absent", "failed"].includes(table.cleanup) &&
        (table.cleanupError === null || typeof table.cleanupError === "string")) ||
      !processIdentity(manifest.coordinator, manifest.runId, file) ||
      !Array.isArray(manifest.services?.processes) || !manifest.services.processes.every((p) => processIdentity(p, manifest.runId, file) && ["api", "web"].includes(p.role ?? "")) ||
      manifest.services.dynamodb?.state !== "reused" || manifest.services.dynamodb.endpoint !== manifest.endpoint ||
      !Array.isArray(manifest.cleanupAttempts) || !manifest.cleanupAttempts.every((attempt) =>
        uuid.test(attempt?.attemptId) && iso(attempt.startedAt) && (attempt.finishedAt === null || iso(attempt.finishedAt)) &&
        ["automatic", "recovery"].includes(attempt.origin) && [null, "complete", "failed", "interrupted"].includes(attempt.outcome) &&
        (attempt.finishedAt === null) === (attempt.outcome === null) && (attempt.interruption === null || typeof attempt.interruption === "string") &&
        attempt.phases?.dynamodb === "reused" && [attempt.phases.writers, attempt.phases.tables, attempt.phases.diagnostics].every((errors) => Array.isArray(errors) && errors.every((error) => typeof error === "string")) &&
        Array.isArray(attempt.tables) && attempt.tables.every((table, index) => table?.role === manifest.tables[index]?.role && table.name === manifest.tables[index]?.name && typeof table.observation === "string" && (table.error === null || typeof table.error === "string"))) ||
      (manifest.cleanupFinishedAt !== null && !iso(manifest.cleanupFinishedAt))) {
    throw new Error("Invalid E2E v2 ownership manifest");
  }
  if (path.basename(file) !== "manifest.json" || path.basename(path.dirname(file)) !== manifest.runId || manifest.coordinator.manifestPath !== file) throw new Error("Invalid E2E manifest path");
  return manifest;
}

export async function readE2EManifest(file: string): Promise<E2EManifest> {
  if (!path.isAbsolute(file) || await realpath(file) !== path.resolve(file)) throw new Error("E2E manifest path must be canonical and must not alias another run");
  const manifest = validateE2EManifest(JSON.parse(await readFile(file, "utf8")) as E2EManifest);
  if (manifest.configuration.manifestPath !== file) throw new Error("E2E manifest reference mismatch");
  return manifest;
}

export async function saveE2EManifest(file: string, manifest: E2EManifest): Promise<void> {
  validateE2EManifest(manifest);
  if (manifest.configuration.manifestPath !== file) throw new Error("E2E manifest reference mismatch");
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, file);
}

export async function createE2EManifest(config: E2EConfiguration, coordinator: ProcessIdentity, suite: string[]): Promise<E2EManifest> {
  const now = new Date().toISOString();
  const manifest: E2EManifest = {
    schemaVersion: 2, owner, mode: "isolated", runId: config.runId!, ownershipNonce: randomUUID(), createdAt: now,
    endpoint: config.endpoint, region: config.region, configuration: config, suite, startedAt: now, finishedAt: null,
    phase: "prepared", pollIds: [], coordinator,
    services: { processes: [], dynamodb: { state: "reused", endpoint: config.endpoint } }, cleanupAttempts: [], cleanupFinishedAt: null,
    tables: (["app", "audit"] as const).map((role) => ({
      role, name: role === "app" ? config.appTableName : config.auditTableName,
      creationAttempted: false, owned: false, creationIdentity: null, deletionAttempted: false,
      deletionRequestedAt: null, cleanup: "pending", cleanupError: null
    }))
  };
  validateE2EManifest(manifest);
  await writeFile(config.manifestPath!, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return manifest;
}

function markerFor(manifest: E2EManifest, table: E2ETable): Record<string, AttributeValue> {
  return { ...markerKey, owner: { S: owner }, runId: { S: manifest.runId }, nonce: { S: manifest.ownershipNonce }, role: { S: table.role } };
}
export function assertTableSchema(table: TableDescription | undefined, role: string): CreationIdentity {
  const primary = table?.KeySchema;
  const attributes = table?.AttributeDefinitions;
  const keys = (schema: typeof primary, pk: string, sk: string): boolean => schema?.length === 2 && schema.some((key) => key.AttributeName === pk && key.KeyType === "HASH") && schema.some((key) => key.AttributeName === sk && key.KeyType === "RANGE");
  const index = table?.GlobalSecondaryIndexes?.find((gsi) => gsi.IndexName === "GSI1");
  const expectedAttributes = role === "app" ? ["PK", "SK", "GSI1PK", "GSI1SK"] : ["PK", "SK"];
  if (table?.TableStatus !== "ACTIVE" || !keys(primary, "PK", "SK") || attributes?.length !== expectedAttributes.length || !expectedAttributes.every((name) => attributes.some((a) => a.AttributeName === name && a.AttributeType === "S")) ||
      table.BillingModeSummary?.BillingMode !== "PAY_PER_REQUEST" || (table.LocalSecondaryIndexes?.length ?? 0) !== 0 ||
      (role === "app" ? table.GlobalSecondaryIndexes?.length !== 1 || !keys(index?.KeySchema, "GSI1PK", "GSI1SK") || index?.Projection?.ProjectionType !== "ALL" || index.IndexStatus !== "ACTIVE" : Boolean(table.GlobalSecondaryIndexes?.length)) ||
      !table.CreationDateTime || !Number.isFinite(table.CreationDateTime.getTime())) throw new Error(`E2E ${role} table schema/readiness mismatch`);
  return { creationDateTime: table.CreationDateTime.getTime(), ...(table.TableId ? { tableId: table.TableId } : {}) };
}
export async function verifyE2EOwnership(client: DynamoDBClient, manifest: E2EManifest): Promise<void> {
  validateE2EManifest(manifest);
  for (const table of manifest.tables) {
    const { Table } = await client.send(new DescribeTableCommand({ TableName: table.name }));
    const identity = assertTableSchema(Table, table.role);
    if (table.creationIdentity && JSON.stringify(identity) !== JSON.stringify(table.creationIdentity)) throw new Error(`E2E creation identity mismatch: ${table.name}`);
    const { Item } = await client.send(new GetItemCommand({ TableName: table.name, Key: markerKey, ConsistentRead: true }));
    const expected = markerFor(manifest, table);
    if (!Item || Object.keys(expected).some((key) => Item[key]?.S !== expected[key]?.S)) throw new Error(`E2E ownership marker mismatch: ${table.name}`);
  }
}

export async function provisionE2ETables(file: string, suppliedClient?: DynamoDBClient): Promise<void> {
  const manifest = await readE2EManifest(file);
  if (manifest.phase !== "prepared" || manifest.tables.some((table) => table.creationAttempted || table.owned)) throw new Error("E2E refuses to reprovision/adopt an existing run");
  const client = suppliedClient ?? e2eClient(manifest.configuration);
  try {
    // Check the entire pair before writes; exclusive CreateTable also closes races.
    for (const table of manifest.tables) {
      try {
        await client.send(new DescribeTableCommand({ TableName: table.name }));
        throw new Error(`E2E table collision: ${table.name}`);
      } catch (error) { if ((error as Error).name !== "ResourceNotFoundException") throw error; }
    }
    manifest.phase = "provisioning";
    await saveE2EManifest(file, manifest);
    await initializeTables(client, manifest.configuration, {
      exclusive: true,
      onCreating: async (name) => {
        manifest.tables.find((table) => table.name === name)!.creationAttempted = true;
        await saveE2EManifest(file, manifest);
      },
      onCreated: async (name) => {
        const table = manifest.tables.find((entry) => entry.name === name)!;
        const { Table } = await client.send(new DescribeTableCommand({ TableName: name }));
        table.creationIdentity = assertTableSchema(Table, table.role);
        await client.send(new PutItemCommand({ TableName: name, Item: markerFor(manifest, table), ConditionExpression: "attribute_not_exists(PK)" }));
        const { Item } = await client.send(new GetItemCommand({ TableName: name, Key: markerKey, ConsistentRead: true }));
        const expected = markerFor(manifest, table);
        if (!Item || Object.keys(expected).some((key) => Item[key]?.S !== expected[key]?.S)) throw new Error(`E2E ownership marker mismatch: ${name}`);
        table.owned = true;
        await saveE2EManifest(file, manifest);
      }
    });
    await verifyE2EOwnership(client, manifest);
  } finally { if (!suppliedClient) client.destroy(); }
}
