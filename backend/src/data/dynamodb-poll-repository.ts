import {
  DescribeTableCommand,
  GetItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
  UpdateItemCommand,
  type AttributeValue,
  type DynamoDBClient
} from "@aws-sdk/client-dynamodb";
import type { AuditEvent, PollRecord, PublicTokenRecord, RepositoryHealth } from "./types.js";

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
                document: { S: JSON.stringify(poll) },
                status: { S: poll.status },
                version: { N: String(poll.version) }
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

  public async updatePoll(poll: PollRecord, audit: AuditEvent): Promise<void> {
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
                document: { S: JSON.stringify(poll) },
                status: { S: poll.status },
                version: { N: String(poll.version) }
              },
              ConditionExpression: "attribute_exists(PK)"
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
                id: { S: audit.id },
                ...(audit.before ? { before: { S: JSON.stringify(audit.before) } } : {}),
                ...(audit.after ? { after: { S: JSON.stringify(audit.after) } } : {})
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

  public async publishPoll(poll: PollRecord, audit: AuditEvent): Promise<void> {
    if (!poll.publicTokenHash) throw new Error("Published poll requires a token hash");
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
                document: { S: JSON.stringify(poll) },
                status: { S: poll.status },
                version: { N: String(poll.version) }
              },
              ConditionExpression: "#status = :draft AND #version = :previousVersion",
              ExpressionAttributeNames: { "#status": "status", "#version": "version" },
              ExpressionAttributeValues: {
                ":draft": { S: "draft" },
                ":previousVersion": { N: String(poll.version - 1) }
              }
            }
          },
          {
            Put: {
              TableName: this.config.appTableName,
              Item: {
                PK: { S: `PUBLIC_TOKEN#${poll.publicTokenHash}` },
                SK: { S: "CAPABILITY" },
                pollId: { S: poll.id },
                state: { S: "active" }
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

  public async getPublicToken(tokenHash: string): Promise<PublicTokenRecord | undefined> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.config.appTableName,
        Key: { PK: { S: `PUBLIC_TOKEN#${tokenHash}` }, SK: { S: "CAPABILITY" } },
        ConsistentRead: true
      })
    );
    if (!result.Item) return undefined;
    return {
      pollId: stringValue(result.Item.pollId, "pollId"),
      state: stringValue(result.Item.state, "state") as PublicTokenRecord["state"]
    };
  }

  public async revokePublicToken(tokenHash: string): Promise<void> {
    await this.client.send(
      new UpdateItemCommand({
        TableName: this.config.appTableName,
        Key: { PK: { S: `PUBLIC_TOKEN#${tokenHash}` }, SK: { S: "CAPABILITY" } },
        UpdateExpression: "SET #state = :revoked",
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeNames: { "#state": "state" },
        ExpressionAttributeValues: { ":revoked": { S: "revoked" } }
      })
    );
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
      action: stringValue(item.action, "action") as AuditEvent["action"],
      actorId: stringValue(item.actorId, "actorId"),
      occurredAt: stringValue(item.occurredAt, "occurredAt"),
      ...(item.before ? { before: JSON.parse(stringValue(item.before, "before")) } : {}),
      ...(item.after ? { after: JSON.parse(stringValue(item.after, "after")) } : {})
    }));
  }
}
