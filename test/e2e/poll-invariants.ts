import { GetItemCommand, QueryCommand, type DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { PollRecord } from "../../backend/src/data/types";
import { expect } from "./fixtures";

// Discovery needs metadata invariants, not participant/capability rows or audit documents.
// Keep strongly consistent point reads so a read-only check cannot hide a recent write.
export async function pollInvariants(client: DynamoDBClient, table: string, id: string) {
  const { Item: metadata } = await client.send(new GetItemCommand({ TableName: table,
    Key: { PK: { S: `POLL#${id}` }, SK: { S: "METADATA" } }, ConsistentRead: true }));
  expect(metadata).toBeDefined();
  const record: PollRecord = JSON.parse(metadata!.document!.S!);
  expect(record.id).toBe(id);
  expect(metadata!.version?.N).toBe(String(record.version));
  expect(metadata!.status?.S).toBe(record.status);
  expect(metadata!.participantCount?.N).toBe(String(record.participantCount));
  expect(metadata!.GSI1PK?.S).toBe(`ORGANISER#${record.organiserId}`);
  expect(metadata!.GSI1SK?.S).toBe(`POLL#${record.createdAt}#${id}`);
  const { organiserId, title, status, version, createdAt, participantCount, proposedDates,
    timeZone, selectedDateId, frozenRanking, provisional } = record;
  return { poll: { id, organiserId, title, status, version, createdAt, participantCount,
    proposedDates, timeZone, selectedDateId, frozenRanking, provisional }, creationKey: metadata!.GSI1SK!.S! };
}

// Read only the mutation's newest events. Complete immutable-history comparisons
// belong in integration integrity coverage; discovery must not download that history.
export async function latestAuditEvents(client: DynamoDBClient, table: string, id: string, count: number) {
  const { Items = [] } = await client.send(new QueryCommand({ TableName: table, ConsistentRead: true,
    KeyConditionExpression: "PK = :pk", ExpressionAttributeValues: { ":pk": { S: `POLL#${id}` } },
    ScanIndexForward: false, Limit: count, ProjectionExpression: "revision, #action, actorCategory",
    ExpressionAttributeNames: { "#action": "action" } }));
  expect(Items).toHaveLength(count);
  return Items.sort((a, b) => Number(a.revision!.N) - Number(b.revision!.N));
}
