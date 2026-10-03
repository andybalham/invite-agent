import {
  CreateTableCommand,
  DescribeTableCommand,
  ResourceInUseException,
  type AttributeDefinition,
  type DynamoDBClient,
  type KeySchemaElement
} from "@aws-sdk/client-dynamodb";

export interface TableNames {
  readonly appTableName: string;
  readonly auditTableName: string;
}

const appAttributes: AttributeDefinition[] = [
  { AttributeName: "PK", AttributeType: "S" },
  { AttributeName: "SK", AttributeType: "S" },
  { AttributeName: "GSI1PK", AttributeType: "S" },
  { AttributeName: "GSI1SK", AttributeType: "S" }
];
const primaryKey: KeySchemaElement[] = [
  { AttributeName: "PK", KeyType: "HASH" },
  { AttributeName: "SK", KeyType: "RANGE" }
];

interface InitializationOptions {
  readonly exclusive?: boolean;
  readonly onCreated?: (tableName: string) => Promise<void>;
}

async function createIfMissing(client: DynamoDBClient, command: CreateTableCommand, options: InitializationOptions): Promise<void> {
  try {
    await client.send(command);
    if (options.onCreated) {
      await waitUntilActive(client, command.input.TableName!);
      await options.onCreated(command.input.TableName!);
    }
  } catch (error) {
    if (options.exclusive || !(error instanceof ResourceInUseException)) {
      throw error;
    }
  }
}

async function waitUntilActive(client: DynamoDBClient, tableName: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = await client.send(new DescribeTableCommand({ TableName: tableName }));
    if (result.Table?.TableStatus === "ACTIVE") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`DynamoDB table ${tableName} did not become active`);
}

export async function initializeTables(
  client: DynamoDBClient,
  names: TableNames,
  options: InitializationOptions = {}
): Promise<void> {
  await createIfMissing(
    client,
    new CreateTableCommand({
      TableName: names.appTableName,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: appAttributes,
      KeySchema: primaryKey,
      GlobalSecondaryIndexes: [
        {
          IndexName: "GSI1",
          KeySchema: [
            { AttributeName: "GSI1PK", KeyType: "HASH" },
            { AttributeName: "GSI1SK", KeyType: "RANGE" }
          ],
          Projection: { ProjectionType: "ALL" }
        }
      ]
    }),
    options
  );
  await createIfMissing(
    client,
    new CreateTableCommand({
      TableName: names.auditTableName,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: appAttributes.slice(0, 2),
      KeySchema: primaryKey
    }),
    options
  );
  await Promise.all([
    waitUntilActive(client, names.appTableName),
    waitUntilActive(client, names.auditTableName)
  ]);
}
