// Node 24's native type stripping keeps validation available before the first build.
import { resolveE2EConfiguration } from "../backend/src/adapters/local/e2e-config.ts";
import { tableNames } from "./smoke-run-resources.mjs";

const [manifestPath, runId, dynamodb, api, web] = process.argv.slice(2);
try {
  const names = tableNames(runId);
  const environment = { ...process.env, SMOKE_RUN_MANIFEST_PATH: manifestPath,
    APP_TABLE_NAME: names.app, AUDIT_TABLE_NAME: names.audit };
  for (const [name, value] of [["DYNAMODB_PORT", dynamodb], ["API_PORT", api], ["WEB_PORT", web]]) {
    if (value && value !== "0") environment[name] = value;
  }
  const config = resolveE2EConfiguration(environment);
  process.stdout.write(`${JSON.stringify(config)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
