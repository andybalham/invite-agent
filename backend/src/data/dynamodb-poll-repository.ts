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
import type { OwnedPollSummary, ResolvedOwnedPollListQuery } from "@invite-a-gent/contracts";
import { matchesOwnedPollQuery, toOwnedPollSummary } from "../domain/my-polls.js";

export type OwnedPollKey = Record<string, AttributeValue>;

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
    version: { N: String(poll.version) },
    ...(poll.participantCount === undefined ? {} : { participantCount: { N: String(poll.participantCount) } })
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
  const undoReference = audit.undoOfEventId && audit.undoOfRevision
    ? {
        undoOfEventId: { S: audit.undoOfEventId },
        undoOfRevision: { N: String(audit.undoOfRevision) }
      }
    : {};
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
        actorCategory: { S: audit.actorCategory },
        revision: { N: String(audit.revision) },
        entityType: { S: audit.entityType },
        entityId: { S: audit.entityId },
        before: { S: JSON.stringify(audit.before) },
        after: { S: JSON.stringify(audit.after) },
        ...undoReference
      },
      ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
    }
  };
}

function versionedPollPut(tableName: string, poll: PollRecord, countDelta = 0): TransactWriteItem {
  const count = poll.participantCount;
  if (count !== undefined && (!Number.isSafeInteger(count) || count + countDelta < 0)) {
    throw new Error("Invalid stored participant count");
  }
  return {
    Put: {
      TableName: tableName,
      Item: pollItem(count === undefined ? poll : { ...poll, participantCount: count + countDelta }),
      // Also reject a legacy writer racing a count backfill (which preserves version).
      ConditionExpression: `#version = :previousVersion AND ${count === undefined ? "attribute_not_exists(participantCount)" : "participantCount = :previousCount"}`,
      ExpressionAttributeNames: { "#version": "version" },
      ExpressionAttributeValues: {
        ":previousVersion": { N: String(poll.version - 1) },
        ...(count === undefined ? {} : { ":previousCount": { N: String(count) } })
      }
    }
  };
}

export class DynamoPollRepository {
  public constructor(
    private readonly client: DynamoDBClient,
    private readonly config: RepositoryConfig
  ) {}

  public async listOwnedSummaries(
    organiserId: string,
    query: ResolvedOwnedPollListQuery,
    startKey?: OwnedPollKey
  ): Promise<{ items: OwnedPollSummary[]; lastEvaluatedKey?: OwnedPollKey }> {
    const items: OwnedPollSummary[] = [];
    let key = startKey;
    let evaluated = 0;
    do {
      const page = await this.client.send(new QueryCommand({
        TableName: this.config.appTableName, IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :owner",
        ExpressionAttributeValues: { ":owner": { S: `ORGANISER#${organiserId}` } },
        ProjectionExpression: "PK, SK, GSI1PK, GSI1SK",
        ScanIndexForward: false, ExclusiveStartKey: key,
        Limit: Math.min(50, query.pageSize - items.length, 200 - evaluated)
      }));
      for (const candidate of page.Items ?? []) {
        evaluated += 1;
        const id = stringValue(candidate.PK, "PK").slice(5);
        // Sequential reads bound concurrency to one; never hydrate participants or audit.
        const poll = await this.getPoll(id);
        if (!poll || poll.organiserId !== organiserId) continue;
        if (candidate.GSI1SK?.S !== `POLL#${poll.createdAt}#${poll.id}`) continue;
        if (matchesOwnedPollQuery(poll, organiserId, query)) {
          if (poll.participantCount === undefined) throw new Error("Dashboard count migration required");
          items.push(toOwnedPollSummary(poll, poll.participantCount));
        }
      }
      key = page.LastEvaluatedKey;
    } while (key && items.length < query.pageSize && evaluated < 200);
    return { items, ...(key ? { lastEvaluatedKey: key } : {}) };
  }

  /** Explicit migration only. Never called by a list/read request. */
  public async backfillParticipantCount(id: string): Promise<void> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const poll = await this.getPoll(id);
      if (!poll || poll.participantCount !== undefined) return;
      let key: OwnedPollKey | undefined;
      let count = 0;
      do {
        const page = await this.client.send(new QueryCommand({
          TableName: this.config.appTableName, ConsistentRead: true, Select: "COUNT",
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :participant)",
          ExpressionAttributeValues: { ":pk": { S: `POLL#${id}` }, ":participant": { S: "PARTICIPANT#" } },
          ExclusiveStartKey: key
        }));
        count += page.Count ?? 0;
        key = page.LastEvaluatedKey;
      } while (key);
      try {
        await this.client.send(new UpdateItemCommand({
          TableName: this.config.appTableName, Key: { PK: { S: `POLL#${id}` }, SK: { S: "METADATA" } },
          UpdateExpression: "SET #document = :after, participantCount = :count",
          ConditionExpression: "#version = :version AND #document = :before AND attribute_not_exists(participantCount)",
          ExpressionAttributeNames: { "#version": "version", "#document": "document" },
          ExpressionAttributeValues: {
            ":version": { N: String(poll.version) }, ":before": { S: JSON.stringify(poll) },
            ":after": { S: JSON.stringify({ ...poll, participantCount: count }) }, ":count": { N: String(count) }
          }
        }));
        return;
      } catch (error) {
        if (!(error instanceof Error) || error.name !== "ConditionalCheckFailedException") throw error;
      }
    }
    throw new Error("Count migration contention; retry before enabling dashboard");
  }

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
              Item: pollItem({ ...poll, participantCount: 0 }),
              ConditionExpression: "attribute_not_exists(PK)"
            }
          },
          auditPut(this.config.auditTableName, audit)
        ]
      })
    );
  }

  public async updatePoll(poll: PollRecord, audit: AuditEvent): Promise<void> {
    await this.client.send(new TransactWriteItemsCommand({
      TransactItems: [versionedPollPut(this.config.appTableName, poll), auditPut(this.config.auditTableName, audit)]
    }));
  }

  public async updateLocation(poll: PollRecord, audit: AuditEvent): Promise<void> {
    await this.client.send(new TransactWriteItemsCommand({
      TransactItems: [versionedPollPut(this.config.appTableName, poll), auditPut(this.config.auditTableName, audit)]
    }));
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
          versionedPollPut(this.config.appTableName, poll, 1),
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
          versionedPollPut(this.config.appTableName, poll, -1),
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

  public async applyParticipantUndo(
    poll: PollRecord,
    before: ParticipantRecord | undefined,
    after: ParticipantRecord | undefined,
    audit: AuditEvent
  ): Promise<void> {
    const participantChange: TransactWriteItem[] = before && after
      ? [
          {
            Put: {
              TableName: this.config.appTableName,
              Item: participantItem(after),
              ConditionExpression: "#document = :beforeDocument",
              ExpressionAttributeNames: { "#document": "document" },
              ExpressionAttributeValues: { ":beforeDocument": { S: JSON.stringify(before) } }
            }
          },
          ...(before.normalizedName === after.normalizedName ? [] : [
            {
              Delete: {
                TableName: this.config.appTableName,
                Key: { PK: { S: `POLL#${poll.id}` }, SK: { S: `NAME#${before.normalizedName}` } },
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
          ] satisfies TransactWriteItem[])
        ]
      : before
        ? [
            {
              Delete: {
                TableName: this.config.appTableName,
                Key: { PK: { S: `POLL#${poll.id}` }, SK: { S: `PARTICIPANT#${before.id}` } },
                ConditionExpression: "#document = :beforeDocument",
                ExpressionAttributeNames: { "#document": "document" },
                ExpressionAttributeValues: { ":beforeDocument": { S: JSON.stringify(before) } }
              }
            },
            {
              Delete: {
                TableName: this.config.appTableName,
                Key: { PK: { S: `POLL#${poll.id}` }, SK: { S: `NAME#${before.normalizedName}` } },
                ConditionExpression: "participantId = :participantId",
                ExpressionAttributeValues: { ":participantId": { S: before.id } }
              }
            }
          ]
        : after
          ? [
              {
                Put: {
                  TableName: this.config.appTableName,
                  Item: participantItem(after),
                  ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
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
            ]
          : [];
    if (participantChange.length === 0) throw new Error("Undo requires a participant change");
    await this.client.send(new TransactWriteItemsCommand({
      TransactItems: [
        versionedPollPut(this.config.appTableName, poll, (after ? 1 : 0) - (before ? 1 : 0)),
        ...participantChange,
        auditPut(this.config.auditTableName, audit)
      ]
    }));
  }

  public async publishPoll(poll: PollRecord, audit: AuditEvent): Promise<void> {
    if (!poll.publicTokenHash) throw new Error("Published poll requires a token hash");
    const metadata = versionedPollPut(this.config.appTableName, poll);
    metadata.Put!.ConditionExpression += " AND #status = :draft";
    metadata.Put!.ExpressionAttributeNames!["#status"] = "status";
    metadata.Put!.ExpressionAttributeValues![":draft"] = { S: "draft" };
    await this.client.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          metadata,
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
          auditPut(this.config.auditTableName, audit)
        ]
      })
    );
  }

  public async closePoll(poll: PollRecord, audit: AuditEvent): Promise<void> {
    await this.client.send(new TransactWriteItemsCommand({
      TransactItems: [versionedPollPut(this.config.appTableName, poll), auditPut(this.config.auditTableName, audit)]
    }));
  }

  public async reopenPoll(poll: PollRecord, audit: AuditEvent): Promise<void> {
    await this.client.send(new TransactWriteItemsCommand({
      TransactItems: [versionedPollPut(this.config.appTableName, poll), auditPut(this.config.auditTableName, audit)]
    }));
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
    return (result.Items ?? []).map((item) => Object.freeze({
      pollId,
      id: stringValue(item.id, "id"),
      action: stringValue(item.action, "action") as AuditEvent["action"],
      actorId: stringValue(item.actorId, "actorId"),
      occurredAt: stringValue(item.occurredAt, "occurredAt"),
      actorCategory: stringValue(item.actorCategory, "actorCategory") as AuditEvent["actorCategory"],
      revision: numberValue(item.revision, "revision"),
      entityType: stringValue(item.entityType, "entityType") as AuditEvent["entityType"],
      entityId: stringValue(item.entityId, "entityId"),
      before: JSON.parse(stringValue(item.before, "before")),
      after: JSON.parse(stringValue(item.after, "after")),
      ...("undoOfEventId" in item && "undoOfRevision" in item
        ? {
            undoOfEventId: stringValue(item.undoOfEventId, "undoOfEventId"),
            undoOfRevision: numberValue(item.undoOfRevision, "undoOfRevision")
          }
        : {})
    })).sort((left, right) => left.revision - right.revision);
  }
}
