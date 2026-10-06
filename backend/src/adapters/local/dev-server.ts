import { createLocalComposition } from "./composition.js";
import { readLocalConfig } from "./config.js";
import { createLocalNodeServer } from "./node-server.js";
import { createE2EAttestation, verifyE2ETargets } from "./e2e-runtime.js";
import { resolveE2EConfiguration } from "./e2e-config.js";

const environment: NodeJS.ProcessEnv = {
  ...process.env,
  APP_ENV: process.env.APP_ENV ?? "local",
  AUTH_MODE: process.env.AUTH_MODE ?? "local",
  AWS_REGION: process.env.AWS_REGION ?? "eu-west-2",
  DYNAMODB_ENDPOINT:
    process.env.DYNAMODB_ENDPOINT ??
    `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`,
  APP_TABLE_NAME: process.env.APP_TABLE_NAME ?? "invite-agent-local-app",
  AUDIT_TABLE_NAME: process.env.AUDIT_TABLE_NAME ?? "invite-agent-local-audit",
  PUBLIC_BASE_URL:
    process.env.PUBLIC_BASE_URL ?? `http://127.0.0.1:${process.env.WEB_PORT ?? "15173"}`
};

// Managed E2E must validate before composition, initialization, or migration.
const e2eConfig = process.env.E2E_MODE ? await verifyE2ETargets(process.env) : undefined;
const app = await createLocalComposition(readLocalConfig(e2eConfig ? process.env : environment));
if (!e2eConfig) await app.initializeTables();

let attestationConfig = e2eConfig;
if (!attestationConfig) {
  try { attestationConfig = resolveE2EConfiguration({ ...environment, E2E_ALLOW_SHARED_TABLES: "1", SMOKE_RUN_MANIFEST_PATH: undefined }); }
  catch { /* Ordinary development may use routing unsupported by E2E. */ }
}
const attestation = attestationConfig ? createE2EAttestation(attestationConfig, environment.PUBLIC_TOKEN_HASH_KEY ?? "local-development-token-hash-key") : undefined;

const server = createLocalNodeServer({ handle: async (request) => {
  if (request.path === "/health/e2e" && request.method === "GET") {
    if (!attestation) return { status: 503, body: { error: { code: "E2E_CONFIG_UNAVAILABLE", message: "Local configuration cannot attest E2E targets" } } };
    const challenge = new URLSearchParams(request.rawQuery).get("challenge") ?? "";
    return { status: 200, body: attestation.response(challenge) };
  }
  if (request.headers["x-local-e2e-instance"] && request.headers["x-local-e2e-instance"] !== attestation?.instanceId) {
    return { status: 409, body: { error: { code: "E2E_API_CHANGED", message: "E2E API instance changed" } } };
  }
  return app.http.handle(request);
} });
const port = Number.parseInt(process.env.API_PORT ?? "14000", 10);

async function stop(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await app.dispose();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void stop().then(() => process.exit(0));
  });
}

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Invite-a-Gent API ready at http://127.0.0.1:${port}\n`);
});
