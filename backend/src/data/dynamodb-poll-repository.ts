import {
  DescribeTableCommand,
  GetItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
  type AttributeValue,
  type DynamoDBClient
} from "@aws-sdk/client-dynamodb";
import type { AuditEvent, PollRecord, RepositoryHealth } from "./types.js";

interface RepositoryConfig {
  readonly appTableName: string;
  readonly auditTableName: string;
}

function stringValue(value: AttributeValue | undefined, name: string): string {
  if (!value || !("S" in value) || value.S === undefined) {
    throw new Error(`Stored item is missing ${name}`);
  }
  return value.S;
}

function decodePoll(item: Record<string, AttributeValue>): PollRecord {
  return JSON.parse(stringValue(item.document, "document")) as PollRecord;
}

export class DynamoPollRepository {
  public constructor(
    private readonly client: DynamoDBClient,
    private readonly config: RepositoryConfig
  ) {}

  public async health(): Promise<RepositoryHealth> {
    await Promise.all([
      this.client.send(new DescribeTableCommand({ TableName: this.config.appTableName })),
      this.client.send(new DescribeTableCommand({ TableName: this.config.auditTableName }))
    ]);
    return { appTable: "reachable", auditTable: "reachable" };
  }

  public async createPoll(poll: PollRecord, audit: AuditEvent): Promise<void> {
    await this.client.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.config.appTableName,
              Item: {
                PK: { S: `POLL#${poll.id}` },
                SK: { S: "METADATA" },
                GSI1PK: { S: `ORGANISER#${poll.organiserId}` },
                GSI1SK: { S: `POLL#${poll.createdAt}#${poll.id}` },
                document: { S: JSON.stringify(poll) }
              },
              ConditionExpression: "attribute_not_exists(PK)"
            }
          },
          {
            Put: {
              TableName: this.config.auditTableName,
              Item: {
                PK: { S: `POLL#${audit.pollId}` },
                SK: { S: `EVENT#${audit.occurredAt}#${audit.id}` },
                action: { S: audit.action },
                actorId: { S: audit.actorId },
                occurredAt: { S: audit.occurredAt },
                id: { S: audit.id }
              },
              ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
            }
          }
        ]
      })
    );
  }

  public async getPoll(id: string): Promise<PollRecord | undefined> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.config.appTableName,
        Key: { PK: { S: `POLL#${id}` }, SK: { S: "METADATA" } },
        ConsistentRead: true
      })
    );
    return result.Item ? decodePoll(result.Item) : undefined;
  }

  public async listAuditEvents(pollId: string): Promise<AuditEvent[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.config.auditTableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :event)",
        ExpressionAttributeValues: { ":pk": { S: `POLL#${pollId}` }, ":event": { S: "EVENT#" } },
        ConsistentRead: true
      })
    );
    return (result.Items ?? []).map((item) => ({
      pollId,
      id: stringValue(item.id, "id"),
      action: "POLL_CREATED",
      actorId: stringValue(item.actorId, "actorId"),
      occurredAt: stringValue(item.occurredAt, "occurredAt")
    }));
  }
}
