import { createLocalComposition } from "./composition.js";
import { readLocalConfig } from "./config.js";
import { createLocalNodeServer } from "./node-server.js";

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

const app = await createLocalComposition(readLocalConfig(environment));
await app.initializeTables();

const server = createLocalNodeServer(app.http);
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
