import {
  DescribeTableCommand,
  GetItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
  UpdateItemCommand,
  type AttributeValue,
  type DynamoDBClient,
  type TransactWriteItem
} from "@aws-sdk/client-dynamodb";
import type {
  AuditEvent,
  ParticipantRecord,
  PollRecord,
  PublicTokenRecord,
  RepositoryHealth
} from "./types.js";

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

function numberValue(value: AttributeValue | undefined, name: string): number {
  if (!value || !("N" in value) || value.N === undefined) {
    throw new Error(`Stored item is missing ${name}`);
  }
  return Number(value.N);
}

function decodePoll(item: Record<string, AttributeValue>): PollRecord {
  return JSON.parse(stringValue(item.document, "document")) as PollRecord;
}

function pollItem(poll: PollRecord): Record<string, AttributeValue> {
  return {
    PK: { S: `POLL#${poll.id}` },
    SK: { S: "METADATA" },
    GSI1PK: { S: `ORGANISER#${poll.organiserId}` },
    GSI1SK: { S: `POLL#${poll.createdAt}#${poll.id}` },
    document: { S: JSON.stringify(poll) },
    status: { S: poll.status },
    version: { N: String(poll.version) }
  };
}

function participantItem(participant: ParticipantRecord): Record<string, AttributeValue> {
  return {
    PK: { S: `POLL#${participant.pollId}` },
    SK: { S: `PARTICIPANT#${participant.id}` },
    document: { S: JSON.stringify(participant) },
    normalizedName: { S: participant.normalizedName }
  };
}

function auditPut(tableName: string, audit: AuditEvent): TransactWriteItem {
  return {
    Put: {
      TableName: tableName,
      Item: {
        PK: { S: `POLL#${audit.pollId}` },
        SK: { S: `EVENT#${audit.occurredAt}#${audit.id}` },
        action: { S: audit.action },
        actorId: { S: audit.actorId },
        occurredAt: { S: audit.occurredAt },
        id: { S: audit.id },
        ...(audit.actorCategory ? { actorCategory: { S: audit.actorCategory } } : {}),
        ...(audit.revision === undefined ? {} : { revision: { N: String(audit.revision) } }),
        ...(audit.entityType ? { entityType: { S: audit.entityType } } : {}),
        ...(audit.entityId ? { entityId: { S: audit.entityId } } : {}),
        ...(audit.before === undefined ? {} : { before: { S: JSON.stringify(audit.before) } }),
        ...(audit.after === undefined ? {} : { after: { S: JSON.stringify(audit.after) } })
      },
      ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
    }
  };
}

function versionedPollPut(tableName: string, poll: PollRecord): TransactWriteItem {
  return {
    Put: {
      TableName: tableName,
      Item: pollItem(poll),
      ConditionExpression: "#version = :previousVersion",
      ExpressionAttributeNames: { "#version": "version" },
      ExpressionAttributeValues: { ":previousVersion": { N: String(poll.version - 1) } }
    }
  };
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
              Item: pollItem(poll),
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

  public async listParticipants(pollId: string): Promise<ParticipantRecord[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.config.appTableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :participant)",
        ExpressionAttributeValues: {
          ":pk": { S: `POLL#${pollId}` },
          ":participant": { S: "PARTICIPANT#" }
        },
        ConsistentRead: true
      })
    );
    return (result.Items ?? [])
      .map((item) => JSON.parse(stringValue(item.document, "document")) as ParticipantRecord)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  }

  public async createParticipant(
    poll: PollRecord,
    participant: ParticipantRecord,
    audit: AuditEvent
  ): Promise<void> {
    await this.client.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          versionedPollPut(this.config.appTableName, poll),
          {
            Put: {
              TableName: this.config.appTableName,
              Item: participantItem(participant),
              ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
            }
          },
          {
            Put: {
              TableName: this.config.appTableName,
              Item: {
                PK: { S: `POLL#${poll.id}` },
                SK: { S: `NAME#${participant.normalizedName}` },
                participantId: { S: participant.id }
              },
              ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
            }
          },
          auditPut(this.config.auditTableName, audit)
        ]
      })
    );
  }

  public async replaceParticipant(
    poll: PollRecord,
    before: ParticipantRecord,
    after: ParticipantRecord,
    audit: AuditEvent
  ): Promise<void> {
    const lockChanges: TransactWriteItem[] =
      before.normalizedName === after.normalizedName
        ? []
        : [
            {
              Delete: {
                TableName: this.config.appTableName,
                Key: {
                  PK: { S: `POLL#${poll.id}` },
                  SK: { S: `NAME#${before.normalizedName}` }
                },
                ConditionExpression: "participantId = :participantId",
                ExpressionAttributeValues: { ":participantId": { S: before.id } }
              }
            },
            {
              Put: {
                TableName: this.config.appTableName,
                Item: {
                  PK: { S: `POLL#${poll.id}` },
                  SK: { S: `NAME#${after.normalizedName}` },
                  participantId: { S: after.id }
                },
                ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
              }
            }
          ];
    await this.client.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          versionedPollPut(this.config.appTableName, poll),
          {
            Put: {
              TableName: this.config.appTableName,
              Item: participantItem(after),
              ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)"
            }
          },
          ...lockChanges,
          auditPut(this.config.auditTableName, audit)
        ]
      })
    );
  }

  public async deleteParticipant(
    poll: PollRecord,
    participant: ParticipantRecord,
    audit: AuditEvent
  ): Promise<void> {
    await this.client.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          versionedPollPut(this.config.appTableName, poll),
          {
            Delete: {
              TableName: this.config.appTableName,
              Key: {
                PK: { S: `POLL#${poll.id}` },
                SK: { S: `PARTICIPANT#${participant.id}` }
              },
              ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)"
            }
          },
          {
            Delete: {
              TableName: this.config.appTableName,
              Key: {
                PK: { S: `POLL#${poll.id}` },
                SK: { S: `NAME#${participant.normalizedName}` }
              },
              ConditionExpression: "participantId = :participantId",
              ExpressionAttributeValues: { ":participantId": { S: participant.id } }
            }
          },
          auditPut(this.config.auditTableName, audit)
        ]
      })
    );
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
      ...(item.actorCategory
        ? {
            actorCategory: stringValue(
              item.actorCategory,
              "actorCategory"
            ) as NonNullable<AuditEvent["actorCategory"]>
          }
        : {}),
      ...(item.revision ? { revision: numberValue(item.revision, "revision") } : {}),
      ...(item.entityType
        ? {
            entityType: stringValue(
              item.entityType,
              "entityType"
            ) as NonNullable<AuditEvent["entityType"]>
          }
        : {}),
      ...(item.entityId ? { entityId: stringValue(item.entityId, "entityId") } : {}),
      ...(item.before ? { before: JSON.parse(stringValue(item.before, "before")) } : {}),
      ...(item.after ? { after: JSON.parse(stringValue(item.after, "after")) } : {})
    }));
  }
}
