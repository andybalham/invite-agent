import { randomUUID } from "node:crypto";
import { ScanCommand } from "@aws-sdk/client-dynamodb";
import { createLocalComposition } from "../../backend/dist/adapters/local/composition.js";
import { createIntegrationApp, integrationClient } from "./integration-fixture.mjs";

export const dashboardOwners = ["local-organiser-olivia", "local-organiser-owen"];
export const dashboardDates = [
  { kind: "date", localDate: "2026-10-10" },
  { kind: "date-time", localDateTime: "2026-10-25T01:30", timeZone: "Europe/London", utcOffset: "+00:00", utcInstant: "2026-10-25T01:30:00.000Z" }
];

export async function seedDashboard(app, { bulk = 0 } = {}) {
  const polls = [];
  for (const [ownerIndex, organiserId] of dashboardOwners.entries()) {
    for (let index = 0; index < 6 + bulk; index += 1) {
      const id = randomUUID();
      const poll = {
        id, organiserId, title: index < 3 ? "Café Autumn dinner" : `${ownerIndex ? "Owen" : "Olivia"} winter ${index}`,
        timeZone: "Europe/London", proposedDates: index === 3 ? [] : dashboardDates,
        status: ["draft", "open", "closed"][index % 3], version: 1, participantCount: 0,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
        // The large matrix exceeds one database page and the 200-candidate budget.
        ...(index >= 6 ? { description: "x".repeat(16000) } : {})
      };
      const audit = { pollId: id, id: randomUUID(), action: "POLL_CREATED", actorId: organiserId,
        actorCategory: "organiser", occurredAt: poll.createdAt, revision: 1,
        entityType: "poll", entityId: id, before: null, after: {} };
      await app.repository.createPoll(poll, audit);
      const participantCount = index < 6 ? index % 3 : 0;
      for (let participant = 0; participant < participantCount; participant += 1) {
        poll.version += 1;
        await app.repository.createParticipant({ ...poll, participantCount: participant }, {
          id: randomUUID(), pollId: id, displayName: `Guest ${participant}`, normalizedName: `guest ${participant}`,
          availability: {}, createdAt: poll.createdAt, updatedAt: poll.createdAt
        }, { ...audit, id: randomUUID(), action: "PARTICIPANT_ADDED", revision: poll.version });
      }
      polls.push({ ...poll, participantCount });
    }
  }
  return polls;
}

export async function dashboardFixture(t, options = {}) {
  const app = await createIntegrationApp(t, createLocalComposition, {
    appEnv: "test", authMode: "local", awsRegion: "eu-west-2",
    dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT ?? `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`,
    publicBaseUrl: "http://127.0.0.1:15173", dashboardCursorSecret: "dashboard-integration-secret-32-characters"
  }, options);
  const polls = await seedDashboard(app, options);
  return { app, polls };
}

export async function dashboardSnapshot(app) {
  const client = integrationClient(app.config.dynamodbEndpoint);
  try {
    const snapshot = [];
    for (const TableName of [app.config.appTableName, app.config.auditTableName]) {
      let key;
      do {
        const page = await client.send(new ScanCommand({ TableName, ConsistentRead: true, ExclusiveStartKey: key }));
        snapshot.push(...page.Items.map((item) => ({ table: TableName, item })));
        key = page.LastEvaluatedKey;
      } while (key);
    }
    return snapshot.sort((a, b) => JSON.stringify([a.table, a.item.PK, a.item.SK]).localeCompare(JSON.stringify([b.table, b.item.PK, b.item.SK])));
  } finally { client.destroy(); }
}
