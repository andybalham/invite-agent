import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

export interface DynamoConnectionConfig {
  readonly awsRegion: string;
  readonly dynamodbEndpoint?: string;
}

export function createDynamoClient(config: DynamoConnectionConfig): DynamoDBClient {
  const localOptions = config.dynamodbEndpoint
    ? {
        endpoint: config.dynamodbEndpoint,
        credentials: { accessKeyId: "local", secretAccessKey: "local" }
      }
    : {};

  return new DynamoDBClient({ region: config.awsRegion, ...localOptions });
}
