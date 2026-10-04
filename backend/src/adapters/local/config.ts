import type { LocalConfig } from "./composition.js";

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value) {
    throw new Error(`${name} is required for the local composition`);
  }
  return value;
}

export function readLocalConfig(environment: NodeJS.ProcessEnv): LocalConfig {
  return {
    appEnv: required(environment, "APP_ENV"),
    authMode: required(environment, "AUTH_MODE"),
    awsRegion: required(environment, "AWS_REGION"),
    dynamodbEndpoint: required(environment, "DYNAMODB_ENDPOINT"),
    appTableName: required(environment, "APP_TABLE_NAME"),
    auditTableName: required(environment, "AUDIT_TABLE_NAME"),
    publicBaseUrl: required(environment, "PUBLIC_BASE_URL"),
    publicTokenHashKey: environment.PUBLIC_TOKEN_HASH_KEY ?? "local-development-token-hash-key",
    ...(environment.DASHBOARD_CURSOR_SECRET ? { dashboardCursorSecret: environment.DASHBOARD_CURSOR_SECRET } : {})
  };
}
