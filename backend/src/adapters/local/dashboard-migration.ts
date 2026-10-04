import { DescribeTableCommand, ScanCommand, type DynamoDBClient, type AttributeValue } from "@aws-sdk/client-dynamodb";
import type { DynamoPollRepository } from "../../data/index.js";
import { toOwnedPollSummary } from "../../domain/my-polls.js";

/** Startup maintenance before the local HTTP listener opens; never a request handler. */
export async function prepareLocalDashboard(
  client: DynamoDBClient, repository: DynamoPollRepository, tableName: string
): Promise<void> {
  const table = await client.send(new DescribeTableCommand({ TableName: tableName }));
  const index = table.Table?.GlobalSecondaryIndexes?.find((candidate) => candidate.IndexName === "GSI1");
  if (index?.IndexStatus !== "ACTIVE" || index.Projection?.ProjectionType !== "ALL" ||
    !index.KeySchema?.some((key) => key.AttributeName === "GSI1PK" && key.KeyType === "HASH") ||
    !index.KeySchema?.some((key) => key.AttributeName === "GSI1SK" && key.KeyType === "RANGE")) {
    throw new Error("Dashboard requires ACTIVE creation-ordered GSI1 with ALL projection");
  }
  let key: Record<string, AttributeValue> | undefined;
  do {
    const page = await client.send(new ScanCommand({
      TableName: tableName, ConsistentRead: true, Limit: 100, ExclusiveStartKey: key,
      FilterExpression: "SK = :metadata", ExpressionAttributeValues: { ":metadata": { S: "METADATA" } },
      ProjectionExpression: "PK, GSI1PK, GSI1SK"
    }));
    for (const item of page.Items ?? []) {
      const id = item.PK?.S?.slice(5);
      if (!id) throw new Error("Invalid poll metadata key");
      await repository.backfillParticipantCount(id);
      const poll = await repository.getPoll(id);
      if (!poll) continue;
      if (item.GSI1PK?.S !== `ORGANISER#${poll.organiserId}` || item.GSI1SK?.S !== `POLL#${poll.createdAt}#${poll.id}`) {
        throw new Error("Existing poll requires creation-index repair before dashboard enablement");
      }
      if (poll.participantCount === undefined) throw new Error("Dashboard count migration incomplete");
      toOwnedPollSummary(poll, poll.participantCount);
    }
    key = page.LastEvaluatedKey;
  } while (key);
}
