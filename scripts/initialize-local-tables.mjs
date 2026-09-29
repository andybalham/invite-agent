import { createLocalComposition, readLocalConfig } from "../backend/dist/adapters/local/index.js";

const defaults = {
  APP_ENV: "local",
  AUTH_MODE: "local",
  AWS_REGION: "eu-west-2",
  DYNAMODB_ENDPOINT: `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`,
  APP_TABLE_NAME: "invite-agent-local-app",
  AUDIT_TABLE_NAME: "invite-agent-local-audit",
  PUBLIC_BASE_URL: `http://127.0.0.1:${process.env.WEB_PORT ?? "15173"}`
};
const config = readLocalConfig({ ...defaults, ...process.env });
const app = await createLocalComposition(config);
try {
  await app.initializeTables();
  process.stdout.write(`Initialized ${config.appTableName} and ${config.auditTableName}\n`);
} finally {
  await app.dispose();
}
