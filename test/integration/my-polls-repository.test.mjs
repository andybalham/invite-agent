import assert from "node:assert/strict";
import test from "node:test";
import { UpdateItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { resolveOwnedPollListQuery } from "../../packages/contracts/dist/index.js";
import { selectOwnedPolls, toOwnedPollSummary } from "../../backend/dist/domain/my-polls.js";
import { DynamoPollRepository } from "../../backend/dist/data/dynamodb-poll-repository.js";
import { PollService } from "../../backend/dist/application/poll-service.js";
import { integrationClient } from "../support/integration-fixture.mjs";
import { dashboardFixture, dashboardOwners, dashboardSnapshot } from "../support/my-polls-fixture.mjs";

// MP-US-02–06,10: every owned candidate, including beyond sparse/1 MB pages.
test("bounded creation-index queries traverse sparse pages without omissions, foreign data or writes", async (t) => {
  const { app, polls } = await dashboardFixture(t, { bulk: 205 });
  const before = await dashboardSnapshot(app);
  const client = integrationClient(app.config.dynamodbEndpoint);
  t.after(() => client.destroy());
  const commands = [];
  const repository = new DynamoPollRepository({ send: async (command) => {
    commands.push(command); return client.send(command);
  } }, app.config);
  for (const owner of dashboardOwners) {
    for (const filter of ["active", "draft", "open", "closed"]) {
      for (const search of ["", "CAFE\u0301  autumn", "missing", "Owen"]) {
        const query = resolveOwnedPollListQuery({ filter, search, pageSize: 7 }).data;
        const items = [];
        let key;
        do {
          commands.length = 0;
          const page = await repository.listOwnedSummaries(owner, query, key);
          assert.ok(page.items.length <= 7);
          assert.ok(commands.filter((c) => c.constructor.name === "GetItemCommand").length <= 200);
          assert.ok(commands.every((c) => ["QueryCommand", "GetItemCommand"].includes(c.constructor.name)));
          for (const command of commands.filter((c) => c.constructor.name === "QueryCommand")) {
            assert.equal(command.input.IndexName, "GSI1");
            assert.equal(command.input.ExpressionAttributeValues[":owner"].S, `ORGANISER#${owner}`);
            assert.equal(command.input.ScanIndexForward, false);
            assert.ok(command.input.Limit <= 50);
          }
          items.push(...page.items);
          key = page.lastEvaluatedKey;
          if (key) assert.equal(key.GSI1PK.S, `ORGANISER#${owner}`);
        } while (key);
        assert.deepEqual(items, selectOwnedPolls(polls, owner, query).map((poll) => toOwnedPollSummary(poll, poll.participantCount)));
        assert.equal(new Set(items.map((item) => item.id)).size, items.length);
      }
    }
  }
  const sparse = await repository.listOwnedSummaries(dashboardOwners[0], resolveOwnedPollListQuery({ search: "Café" }).data);
  assert.deepEqual(sparse.items, []);
  assert.ok(sparse.lastEvaluatedKey, "zero-match budget page must continue");
  assert.deepEqual(await dashboardSnapshot(app), before);
});

test("participant counts survive add/delete/undo and edits/close/reopen retain creation order", async (t) => {
  const { app } = await dashboardFixture(t);
  const service = new PollService(app.repository, { baseUrl: app.config.publicBaseUrl, tokenHashKey: "lifecycle" });
  const owner = dashboardOwners[0];
  const created = await service.create({ title: "Lifecycle", timeZone: "Europe/London", proposedDates: [
    { kind: "date", localDate: "2026-10-10" }, { kind: "date", localDate: "2026-10-11" }
  ] }, owner);
  const original = await app.repository.getPoll(created.id);
  const published = await service.publish(created.id, owner);
  const token = published.publicUrl.split("/").at(-1);
  await service.addParticipant(token, { displayName: "One" });
  const [participant] = await app.repository.listParticipants(created.id);
  assert.equal((await app.repository.getPoll(created.id)).participantCount, 1);
  await service.updateParticipant(token, participant.id, { displayName: "Renamed" });
  await service.updateParticipant(token, participant.id, { dateId: `${created.id}-date-1`, availability: "yes" });
  assert.equal((await app.repository.getPoll(created.id)).participantCount, 1);
  await service.removeParticipant(token, participant.id, { confirmation: "Renamed" });
  assert.equal((await app.repository.getPoll(created.id)).participantCount, 0);
  const events = await app.repository.listAuditEvents(created.id);
  await service.undo(created.id, events.at(-1).id, { confirmed: true }, owner);
  assert.equal((await app.repository.getPoll(created.id)).participantCount, 1);
  await service.undo(created.id, events.find((event) => event.action === "PARTICIPANT_ADDED").id, { confirmed: true }, owner);
  assert.equal((await app.repository.getPoll(created.id)).participantCount, 0);
  await service.update(created.id, { title: "Changed", timeZone: original.timeZone, proposedDates: original.proposedDates }, owner);
  await service.updateLocation(created.id, { location: "Hall" }, owner);
  await service.close(created.id, { selectedDateId: `${created.id}-date-1`, confirmed: true }, owner);
  assert.ok((await app.repository.listOwnedSummaries(owner, resolveOwnedPollListQuery({ filter: "closed" }).data)).items.some((item) => item.id === created.id));
  await service.reopen(created.id, { confirmed: true }, owner);
  const result = await app.repository.listOwnedSummaries(owner, resolveOwnedPollListQuery({}).data);
  assert.equal(result.items[0].id, created.id);
  assert.equal(result.items[0].createdAt, original.createdAt);
  assert.equal(result.items[0].participantCount, 0);
});

test("legacy counts require an explicit paginated migration; list never repairs data", async (t) => {
  const { app, polls } = await dashboardFixture(t);
  const poll = polls[2];
  const client = integrationClient(app.config.dynamodbEndpoint);
  t.after(() => client.destroy());
  const { participantCount: _, ...legacy } = await app.repository.getPoll(poll.id);
  await client.send(new UpdateItemCommand({ TableName: app.config.appTableName,
    Key: { PK: { S: `POLL#${poll.id}` }, SK: { S: "METADATA" } },
    UpdateExpression: "SET #document = :document REMOVE participantCount", ExpressionAttributeNames: { "#document": "document" },
    ExpressionAttributeValues: { ":document": { S: JSON.stringify(legacy) } } }));
  const before = await dashboardSnapshot(app);
  const query = resolveOwnedPollListQuery({ filter: "closed" }).data;
  await assert.rejects(app.repository.listOwnedSummaries(poll.organiserId, query));
  assert.deepEqual(await dashboardSnapshot(app), before);
  let participantPages = 0;
  const repository = new DynamoPollRepository({ send: async (command) => {
    if (command instanceof QueryCommand && !command.input.IndexName) {
      command.input.Limit = 1; participantPages += 1;
    }
    return client.send(command);
  } }, app.config);
  await repository.backfillParticipantCount(poll.id);
  assert.ok(participantPages >= 2);
  assert.deepEqual(await app.repository.getPoll(poll.id), { ...legacy, participantCount: 2 });
  assert.equal((await app.repository.listOwnedSummaries(poll.organiserId, query)).items.find((item) => item.id === poll.id).participantCount, 2);
  const after = await dashboardSnapshot(app);
  await repository.backfillParticipantCount(poll.id);
  assert.deepEqual(await dashboardSnapshot(app), after);
  await app.initializeTables();
  assert.deepEqual(await dashboardSnapshot(app), after, "local startup migration is idempotent");
  assert.deepEqual(after.filter((row) => row.table === app.config.auditTableName), before.filter((row) => row.table === app.config.auditTableName));
});
