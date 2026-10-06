import { randomUUID } from "node:crypto";

export type E2EMode = "isolated" | "shared" | "smoke";
export interface E2EConfiguration {
  mode: E2EMode;
  runId: string | null;
  manifestPath: string | null;
  appEnv: string;
  authMode: "local";
  endpoint: string;
  region: string;
  dynamodbPort: number;
  apiPort: number;
  webPort: number;
  apiOrigin: string;
  webOrigin: string;
  publicBaseUrl: string;
  appTableName: string;
  auditTableName: string;
}

export function tcpPort(value: string | number, name: string): number {
  if (!/^\d+$/.test(String(value)) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error(`${name} must be a TCP port between 1 and 65535`);
  }
  return Number(value);
}

export function localEndpoint(value: string): string {
  // Validate the literal authority too: URL normalization must not admit aliases,
  // credentials, encoded hosts, trailing queries, or normalized dot paths.
  const match = /^http:\/\/(127\.0\.0\.1|localhost):(\d+)(\/)?$/.exec(value);
  if (!match) throw new Error("E2E requires an explicit loopback HTTP DynamoDB endpoint");
  return `http://127.0.0.1:${tcpPort(match[2]!, "DYNAMODB_ENDPOINT port")}`;
}

export function validateRunId(runId: string): string {
  if (!/^\d{8}t\d{9}z-[a-f0-9]{32}$/.test(runId)) throw new Error("Invalid E2E run ID");
  const iso = `${runId.slice(0, 4)}-${runId.slice(4, 6)}-${runId.slice(6, 8)}T${runId.slice(9, 11)}:${runId.slice(11, 13)}:${runId.slice(13, 15)}.${runId.slice(15, 18)}Z`;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== iso) throw new Error("Invalid E2E UTC timestamp");
  return runId;
}

export function newRunId(): string {
  return `${new Date().toISOString().replace(/[-:.]/g, "").toLowerCase()}-${randomUUID().replaceAll("-", "")}`;
}

export function e2eTableNames(runId: string): { app: string; audit: string } {
  validateRunId(runId);
  return { app: `invite-agent-e2e-app-${runId}`, audit: `invite-agent-e2e-audit-${runId}` };
}

export function resolveE2EConfiguration(environment: NodeJS.ProcessEnv, runId?: string): E2EConfiguration {
  const optIn = environment.E2E_ALLOW_SHARED_TABLES ?? "0";
  if (!["0", "1"].includes(optIn)) throw new Error("E2E_ALLOW_SHARED_TABLES must be exactly 0 or 1");
  if (optIn === "1" && environment.CI) throw new Error("Shared E2E tables are forbidden in CI");
  if (environment.APP_ENV !== undefined && !["local", "test"].includes(environment.APP_ENV)) throw new Error("E2E requires APP_ENV=local or test");
  if (environment.AUTH_MODE !== undefined && environment.AUTH_MODE !== "local") throw new Error("E2E requires AUTH_MODE=local");
  const smoke = Boolean(environment.SMOKE_RUN_MANIFEST_PATH);
  if (smoke && optIn === "1") throw new Error("Managed smoke refuses shared-table opt-in");
  const mode = smoke ? "smoke" : optIn === "1" ? "shared" : "isolated";
  if (mode === "shared" && (!environment.APP_ENV || !environment.DYNAMODB_ENDPOINT || !environment.APP_TABLE_NAME || !environment.AUDIT_TABLE_NAME)) {
    throw new Error("Shared E2E requires explicit APP_ENV, DYNAMODB_ENDPOINT, APP_TABLE_NAME and AUDIT_TABLE_NAME");
  }
  const endpoint = localEndpoint(environment.DYNAMODB_ENDPOINT ?? `http://127.0.0.1:${environment.DYNAMODB_PORT ?? "18000"}`);
  const dynamodbPort = Number(endpoint.slice(endpoint.lastIndexOf(":") + 1));
  if (environment.DYNAMODB_PORT !== undefined && tcpPort(environment.DYNAMODB_PORT, "DYNAMODB_PORT") !== dynamodbPort) throw new Error("DYNAMODB_ENDPOINT and DYNAMODB_PORT disagree");
  const apiPort = tcpPort(environment.API_PORT ?? "14000", "API_PORT");
  const webPort = tcpPort(environment.WEB_PORT ?? "15173", "WEB_PORT");
  if (new Set([apiPort, webPort, dynamodbPort]).size !== 3) throw new Error("E2E service ports must be distinct");
  const webOrigin = `http://127.0.0.1:${webPort}`;
  if (environment.PUBLIC_BASE_URL !== undefined && environment.PUBLIC_BASE_URL !== webOrigin) throw new Error("PUBLIC_BASE_URL must match WEB_PORT");
  const region = environment.AWS_REGION ?? "eu-west-2";
  if (!region.trim() || region !== region.trim()) throw new Error("AWS_REGION must be nonempty without surrounding whitespace");
  const id = mode === "isolated" ? validateRunId(runId ?? environment.E2E_RUN_ID ?? "") : null;
  const names = id ? e2eTableNames(id) : { app: environment.APP_TABLE_NAME!, audit: environment.AUDIT_TABLE_NAME! };
  if (![names.app, names.audit].every((name) => typeof name === "string" && /^[A-Za-z0-9_.-]{3,255}$/.test(name)) || names.app === names.audit) throw new Error("E2E requires two distinct valid table names");
  return {
    mode, runId: id, manifestPath: mode === "smoke" ? environment.SMOKE_RUN_MANIFEST_PATH! : mode === "isolated" ? environment.E2E_RUN_MANIFEST_PATH ?? null : null,
    appEnv: mode === "shared" ? environment.APP_ENV! : "test", authMode: "local",
    endpoint, region, dynamodbPort, apiPort, webPort,
    apiOrigin: `http://127.0.0.1:${apiPort}`, webOrigin, publicBaseUrl: webOrigin,
    appTableName: names.app, auditTableName: names.audit
  };
}

export function e2eEnvironment(config: E2EConfiguration, environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...environment, E2E_ALLOW_SHARED_TABLES: config.mode === "shared" ? "1" : "0",
    E2E_MODE: config.mode, APP_ENV: config.appEnv, AUTH_MODE: config.authMode,
    DYNAMODB_ENDPOINT: config.endpoint, DYNAMODB_PORT: String(config.dynamodbPort),
    AWS_REGION: config.region, API_PORT: String(config.apiPort), WEB_PORT: String(config.webPort),
    PUBLIC_BASE_URL: config.publicBaseUrl, APP_TABLE_NAME: config.appTableName, AUDIT_TABLE_NAME: config.auditTableName,
    PUBLIC_TOKEN_HASH_KEY: environment.PUBLIC_TOKEN_HASH_KEY ?? "local-development-token-hash-key",
    ...(config.runId ? { E2E_RUN_ID: config.runId } : {}),
    ...(config.manifestPath && config.mode === "isolated" ? { E2E_RUN_MANIFEST_PATH: config.manifestPath } : {})
  };
}

export function assertEffectiveEnvironment(config: E2EConfiguration, environment: NodeJS.ProcessEnv): void {
  const expected = e2eEnvironment(config, {});
  for (const name of ["E2E_MODE", "E2E_ALLOW_SHARED_TABLES", "APP_ENV", "AUTH_MODE", "DYNAMODB_ENDPOINT", "DYNAMODB_PORT", "AWS_REGION", "API_PORT", "WEB_PORT", "PUBLIC_BASE_URL", "APP_TABLE_NAME", "AUDIT_TABLE_NAME", ...(config.mode === "isolated" ? ["E2E_RUN_ID", "E2E_RUN_MANIFEST_PATH"] : [])]) {
    if (environment[name] !== expected[name]) throw new Error(`E2E effective configuration drift: ${name}`);
  }
  if (!environment.PUBLIC_TOKEN_HASH_KEY) throw new Error("E2E requires PUBLIC_TOKEN_HASH_KEY in each child");
}
