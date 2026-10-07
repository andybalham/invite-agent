import { randomUUID } from "node:crypto";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { PollRecord } from "../../backend/src/data/types";
import { DynamoPollRepository } from "../../backend/dist/data/dynamodb-poll-repository.js";

type SeedPollInput = {
  client: DynamoDBClient;
  appTableName: string;
  auditTableName: string;
  organiserId: string;
  title: string;
  description?: string;
  location?: string;
  timeZone?: string;
};

/**
 * Seeds a valid draft directly through the test repository boundary.
 * Use the HTTP API only when creation itself is the behavior under test.
 */
export async function seedDraftPoll({
  client,
  appTableName,
  auditTableName,
  organiserId,
  title,
  description = "description-only-needle",
  location = "location-only-needle",
  timeZone = "Europe/London"
}: SeedPollInput): Promise<PollRecord> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const proposedDates = [
    { id: randomUUID(), kind: "date" as const, localDate: "2026-10-10" },
    { id: randomUUID(), kind: "date" as const, localDate: "2026-10-17" }
  ];
  const poll: PollRecord = {
    id,
    organiserId,
    title,
    description,
    location,
    timeZone,
    proposedDates,
    status: "draft",
    version: 1,
    participantCount: 0,
    createdAt
  };
  const repository = new DynamoPollRepository(client, { appTableName, auditTableName });
  await repository.createPoll(poll, {
    pollId: id,
    id: randomUUID(),
    action: "POLL_CREATED",
    actorId: organiserId,
    actorCategory: "organiser",
    occurredAt: createdAt,
    revision: 1,
    entityType: "poll",
    entityId: id,
    before: null,
    after: poll
  });
  return poll;
}
