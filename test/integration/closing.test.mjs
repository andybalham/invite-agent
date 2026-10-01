import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const compositionUrl = pathToFileURL(path.join(root, "backend/dist/adapters/local/composition.js")).href;
const suffix = `closing-${process.pid}-${Date.now()}`;
const config = {
  appEnv: "test", authMode: "local", awsRegion: "eu-west-2",
  dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT ?? `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`,
  appTableName: `invite-agent-test-app-${suffix}`, auditTableName: `invite-agent-test-audit-${suffix}`,
  publicBaseUrl: "http://127.0.0.1:15173", publicTokenHashKey: "closing-test-key"
};
const owner = { "x-local-organiser-id": "local-organiser-closing" };
const pollInput = {
  title: "Choose the final date", timeZone: "Europe/London",
  proposedDates: [
    { kind: "date", localDate: "2026-10-10" },
    { kind: "date", localDate: "2026-10-17" },
    { kind: "date", localDate: "2026-10-24" },
    { kind: "date", localDate: "2026-10-31" },
    { kind: "date", localDate: "2026-11-07" },
    { kind: "date", localDate: "2026-11-14" }
  ]
};

async function fixture(t, name) {
  const { createLocalComposition } = await import(compositionUrl);
  const app = await createLocalComposition({
    ...config,
    appTableName: `${config.appTableName}-${name}`,
    auditTableName: `${config.auditTableName}-${name}`
  });
  t.after(() => app.dispose());
  await app.initializeTables();
  const created = await app.http.handle({ method: "POST", path: "/api/organiser/polls", headers: owner, body: pollInput });
  const published = await app.http.handle({ method: "POST", path: `/api/organiser/polls/${created.body.id}/publish`, headers: owner });
  return { app, pollId: created.body.id, token: published.body.publicUrl.split("/").at(-1) };
}

async function addYes(app, token, displayName, dateIndexes) {
  const collection = `/api/public/polls/${token}/participants`;
  let response = await app.http.handle({ method: "POST", path: collection, headers: {}, body: { displayName } });
  const participant = response.body.participants.find(({ displayName: name }) => name === displayName);
  for (const index of dateIndexes) {
    response = await app.http.handle({
      method: "PUT", path: `${collection}/${participant.id}`, headers: {},
      body: { dateId: response.body.proposedDates[index].id, availability: "yes" }
    });
  }
  return response.body;
}

test("confirmation atomically closes with selected date, frozen top five, and one combined audit event", async (t) => {
  const { app, pollId, token } = await fixture(t, "atomic");
  let open = await addYes(app, token, "Alice", [1, 5]);
  open = await addYes(app, token, "Bob", [1, 0]);
  const selectedDateId = open.proposedDates[1].id;
  const frozenRanking = structuredClone(open.ranking);
  const beforeEvents = await app.repository.listAuditEvents(pollId);

  const closed = await app.http.handle({
    method: "POST", path: `/api/organiser/polls/${pollId}/close`, headers: owner,
    body: { selectedDateId, confirmed: true }
  });
  assert.equal(closed.status, 200);
  assert.equal(closed.body.poll.status, "closed");
  assert.equal(closed.body.poll.selectedDateId, selectedDateId);
  assert.deepEqual(closed.body.poll.ranking, frozenRanking);

  const stored = await app.repository.getPoll(pollId);
  assert.equal(stored.status, "closed");
  assert.equal(stored.selectedDateId, selectedDateId);
  assert.deepEqual(stored.frozenRanking, frozenRanking);
  const afterEvents = await app.repository.listAuditEvents(pollId);
  assert.equal(afterEvents.length, beforeEvents.length + 1);
  assert.equal(afterEvents.at(-1).action, "POLL_CLOSED");
  assert.deepEqual(afterEvents.at(-1).after, { status: "closed", selectedDateId, ranking: frozenRanking });

  const blockedWrite = await app.http.handle({
    method: "POST", path: `/api/public/polls/${token}/participants`, headers: {}, body: { displayName: "Chandra" }
  });
  assert.equal(blockedWrite.status, 422);
  const publicPoll = await app.http.handle({ method: "GET", path: `/api/public/polls/${token}`, headers: {} });
  assert.deepEqual(publicPoll.body.ranking, frozenRanking);
  assert.equal(publicPoll.body.selectedDateId, selectedDateId);
});

test("invalid, unauthorized, unconfirmed, and non-proposed close attempts are no-ops", async (t) => {
  const { app, pollId } = await fixture(t, "rejected");
  const before = await app.repository.getPoll(pollId);
  const auditBefore = await app.repository.listAuditEvents(pollId);
  const attempts = [
    [{}, { selectedDateId: `${pollId}-date-1`, confirmed: true }, 401],
    [{ "x-local-organiser-id": "local-organiser-other" }, { selectedDateId: `${pollId}-date-1`, confirmed: true }, 403],
    [owner, { selectedDateId: `${pollId}-date-1`, confirmed: false }, 400],
    [owner, { selectedDateId: `${pollId}-date-999`, confirmed: true }, 400],
    [owner, { selectedDateId: `${pollId}-date-1`, confirmed: true, publicTokenHash: "leak" }, 400]
  ];
  for (const [headers, body, status] of attempts) {
    const result = await app.http.handle({ method: "POST", path: `/api/organiser/polls/${pollId}/close`, headers, body });
    assert.equal(result.status, status);
  }
  assert.deepEqual(await app.repository.getPoll(pollId), before);
  assert.deepEqual(await app.repository.listAuditEvents(pollId), auditBefore);
});

test("concurrent close confirmations have one winner and exactly one closure audit", async (t) => {
  const { app, pollId } = await fixture(t, "concurrent");
  const path = `/api/organiser/polls/${pollId}/close`;
  const results = await Promise.all([
    app.http.handle({ method: "POST", path, headers: owner, body: { selectedDateId: `${pollId}-date-1`, confirmed: true } }),
    app.http.handle({ method: "POST", path, headers: owner, body: { selectedDateId: `${pollId}-date-2`, confirmed: true } })
  ]);
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
  assert.equal((await app.repository.listAuditEvents(pollId)).filter(({ action }) => action === "POLL_CLOSED").length, 1);
});
