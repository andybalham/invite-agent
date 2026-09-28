import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PollService } from "../../application/index.js";
import {
  createDynamoClient,
  DynamoPollRepository,
  initializeTables
} from "../../data/index.js";
import { createSharedHttpHandler } from "../../http/index.js";
import { createLocalAuthentication } from "./authentication.js";

export interface LocalConfig {
  readonly appEnv: string;
  readonly authMode: string;
  readonly awsRegion: string;
  readonly dynamodbEndpoint: string;
  readonly appTableName: string;
  readonly auditTableName: string;
  readonly publicBaseUrl: string;
  readonly publicTokenHashKey?: string;
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
    tokenHashKey: config.publicTokenHashKey ?? "local-development-token-hash-key"
  });
  return {
    config,
    repository,
    http: createSharedHttpHandler({ authenticate, polls, repository }),
    initializeTables: () => initializeTables(client, config),
    dispose: () => client.destroy()
  };
}
