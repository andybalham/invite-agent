import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const compositionUrl = pathToFileURL(path.join(root, "backend/dist/adapters/local/composition.js")).href;
const suffix = `closed-state-${process.pid}-${Date.now()}`;
const baseConfig = {
  appEnv: "test",
  authMode: "local",
  awsRegion: "eu-west-2",
  dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT ?? `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`,
  appTableName: `invite-agent-test-app-${suffix}`,
  auditTableName: `invite-agent-test-audit-${suffix}`,
  publicBaseUrl: "http://127.0.0.1:15173",
  publicTokenHashKey: "closed-state-test-key"
};

async function fixture(t, name) {
  const { createLocalComposition } = await import(compositionUrl);
  const owner = { "x-local-organiser-id": `closed-state-owner-${name}` };
  const app = await createLocalComposition({
    ...baseConfig,
    appTableName: `${baseConfig.appTableName}-${name}`,
    auditTableName: `${baseConfig.auditTableName}-${name}`
  });
  t.after(() => app.dispose());
  await app.initializeTables();
  const draftInput = {
    title: "Frozen autumn result",
    timeZone: "Europe/London",
    proposedDates: [
      { kind: "date", localDate: "2026-10-10" },
      { kind: "date-time", localDateTime: "2026-10-17T18:00" },
      { kind: "date", localDate: "2026-10-24" }
    ]
  };
  const created = await app.http.handle({ method: "POST", path: "/api/organiser/polls", headers: owner, body: draftInput });
  const published = await app.http.handle({ method: "POST", path: `/api/organiser/polls/${created.body.id}/publish`, headers: owner });
  const token = published.body.publicUrl.split("/").at(-1);
  const collection = `/api/public/polls/${token}/participants`;
  let latest;
  for (const [displayName, yesIndexes] of [["Alice", [0, 1]], ["Bob", [0]], ["Chandra", [1]]]) {
    const added = await app.http.handle({ method: "POST", path: collection, headers: {}, body: { displayName } });
    latest = added.body;
    const participant = latest.participants.find(({ displayName: candidate }) => candidate === displayName);
    for (const index of yesIndexes) {
      latest = (await app.http.handle({
        method: "PUT",
        path: `${collection}/${participant.id}`,
        headers: {},
        body: { dateId: latest.proposedDates[index].id, availability: "yes" }
      })).body;
    }
  }
  const selectedDateId = latest.proposedDates[2].id;
  const closingRanking = structuredClone(latest.ranking);
  const closed = await app.http.handle({
    method: "POST",
    path: `/api/organiser/polls/${created.body.id}/close`,
    headers: owner,
    body: { selectedDateId, confirmed: true }
  });
  assert.equal(closed.status, 200);
  assert.notEqual(closingRanking[0].choiceId, selectedDateId, "fixture selects a non-leading final date");
  return {
    app,
    pollId: created.body.id,
    token,
    owner,
    collection,
    draftInput,
    participant: closed.body.poll.participants[0],
    selectedDateId,
    closingRanking
  };
}

async function observableSnapshot(context) {
  const poll = await context.app.http.handle({ method: "GET", path: `/api/public/polls/${context.token}`, headers: {} });
  return {
    publicPoll: poll.body,
    storedPoll: await context.app.repository.getPoll(context.pollId),
    audit: await context.app.repository.listAuditEvents(context.pollId)
  };
}

// S-022 / US-26: all link-holder row mutations are lifecycle rejected and atomically inert.
test("closed public add, rename, availability, and delete requests return 422 without observable effects", async (t) => {
  const context = await fixture(t, "participant-writes");
  const before = await observableSnapshot(context);
  const item = `${context.collection}/${context.participant.id}`;
  const attempts = [
    { method: "POST", path: context.collection, body: { displayName: "Dana" } },
    { method: "PUT", path: item, body: { displayName: "Alicia" } },
    { method: "PUT", path: item, body: { dateId: context.selectedDateId, availability: "yes" } },
    { method: "DELETE", path: item, body: { confirmation: context.participant.displayName } }
  ];

  for (const attempt of attempts) {
    const response = await context.app.http.handle({ ...attempt, headers: {} });
    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, "INVALID_LIFECYCLE");
    const serialized = JSON.stringify(response.body);
    assert.equal(serialized.includes(context.token), false, "rejection must not disclose the public capability token");
    assert.equal(serialized.includes(context.participant.displayName), false, "rejection must not disclose participant data");
  }

  assert.deepEqual(await observableSnapshot(context), before);
});

// S-022 / US-26: whole-poll writes cannot bypass the Closed date lock.
test("closed organiser date add, edit, reorder, and remove requests return 422 and preserve data, totals, ranking, and audit", async (t) => {
  const context = await fixture(t, "date-writes");
  const before = await observableSnapshot(context);
  const [first, second, third] = context.draftInput.proposedDates;
  const attempts = [
    [...context.draftInput.proposedDates, { kind: "date", localDate: "2026-10-31" }],
    [{ kind: "date", localDate: "2026-10-11" }, second, third],
    [second, first, third],
    [first, second]
  ];
  const responses = await Promise.all(attempts.map((proposedDates) => context.app.http.handle({
    method: "PUT",
    path: `/api/organiser/polls/${context.pollId}`,
    headers: context.owner,
    body: { ...context.draftInput, proposedDates }
  })));
  const after = await observableSnapshot(context);

  assert.deepEqual(responses.map(({ status }) => status), [422, 422, 422, 422]);
  assert.ok(responses.every(({ body }) => body.error?.code === "INVALID_LIFECYCLE"));
  assert.deepEqual(after, before);
});

test("closed proposed-date rejection preserves authorization boundaries and is not bypassed concurrently", async (t) => {
  const context = await fixture(t, "authorization-concurrency");
  const before = await observableSnapshot(context);
  const body = {
    ...context.draftInput,
    proposedDates: [...context.draftInput.proposedDates].reverse()
  };
  const unauthenticated = await context.app.http.handle({
    method: "PUT", path: `/api/organiser/polls/${context.pollId}`, headers: {}, body
  });
  const wrongOwner = await context.app.http.handle({
    method: "PUT",
    path: `/api/organiser/polls/${context.pollId}`,
    headers: { "x-local-organiser-id": "closed-state-other-owner" },
    body
  });
  const concurrent = await Promise.all(Array.from({ length: 2 }, () => context.app.http.handle({
    method: "PUT", path: `/api/organiser/polls/${context.pollId}`, headers: context.owner, body
  })));

  assert.equal(unauthenticated.status, 401);
  assert.equal(wrongOwner.status, 403);
  assert.deepEqual(concurrent.map(({ status }) => status), [422, 422]);
  assert.deepEqual(await observableSnapshot(context), before);
});

// S-022 / US-27: every read uses the immutable close-time snapshot, including a selected non-leader.
test("closed reads retain the same frozen ranking and non-leading selected result", async (t) => {
  const context = await fixture(t, "fresh-reads");
  const reads = await Promise.all(Array.from({ length: 3 }, () => context.app.http.handle({
    method: "GET", path: `/api/public/polls/${context.token}`, headers: {}
  })));

  assert.ok(reads.every(({ status }) => status === 200));
  for (const { body } of reads) {
    assert.equal(body.status, "closed");
    assert.equal(body.selectedDateId, context.selectedDateId);
    assert.deepEqual(body.ranking, context.closingRanking);
    assert.notEqual(body.ranking[0].choiceId, body.selectedDateId);
  }
});
