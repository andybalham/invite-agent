import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PollService } from "../../application/index.js";
import {
  createDynamoClient,
  DynamoPollRepository,
  initializeTables
} from "../../data/index.js";
import { createSharedHttpHandler } from "../../http/index.js";
import { createLocalAuthentication } from "./authentication.js";
import { prepareLocalDashboard } from "./dashboard-migration.js";
import { randomBytes } from "node:crypto";

export interface LocalConfig {
  readonly appEnv: string;
  readonly authMode: string;
  readonly awsRegion: string;
  readonly dynamodbEndpoint: string;
  readonly appTableName: string;
  readonly auditTableName: string;
  readonly publicBaseUrl: string;
  readonly publicTokenHashKey?: string;
  readonly dashboardCursorSecret?: string;
}

export interface LocalComposition {
  readonly config: LocalConfig;
  readonly repository: DynamoPollRepository;
  readonly http: ReturnType<typeof createSharedHttpHandler>;
  initializeTables(): Promise<void>;
  dispose(): void | Promise<void>;
}

export async function createLocalComposition(config: LocalConfig): Promise<LocalComposition> {
  if (config.authMode !== "local") {
    throw new Error("Local composition requires AUTH_MODE=local");
  }
  const authenticate = createLocalAuthentication(config.appEnv);
  const client: DynamoDBClient = createDynamoClient(config);
  const repository = new DynamoPollRepository(client, config);
  const polls = new PollService(repository, {
    baseUrl: config.publicBaseUrl,
    tokenHashKey: config.publicTokenHashKey ?? "local-development-token-hash-key",
    dashboardCursorSecret: config.dashboardCursorSecret ?? randomBytes(32).toString("base64url")
  });
  return {
    config,
    repository,
    http: createSharedHttpHandler({ authenticate, polls, repository }),
    initializeTables: async () => {
      await initializeTables(client, config);
      await prepareLocalDashboard(client, repository, config.appTableName);
    },
    dispose: () => client.destroy()
  };
}
