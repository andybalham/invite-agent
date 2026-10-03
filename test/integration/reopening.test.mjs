import assert from "node:assert/strict";
import test from "node:test";
import { createIntegrationApp } from "../support/integration-fixture.mjs";
import { createLocalComposition } from "../../backend/dist/adapters/local/composition.js";

const owner = { "x-local-organiser-id": "local-organiser-reopening" };
const suffix = `reopening-${process.pid}-${Date.now()}`;
async function fixture(t, name) {
  const app = await createIntegrationApp(t, createLocalComposition, {
    appEnv: "test", authMode: "local", awsRegion: "eu-west-2",
    dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT ?? `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`,
    appTableName: `invite-agent-test-app-${suffix}-${name}`, auditTableName: `invite-agent-test-audit-${suffix}-${name}`,
    publicBaseUrl: "http://127.0.0.1:15173", publicTokenHashKey: "reopening-test-key"
  });
  const call = (method, path, body, headers = owner) => app.http.handle({ method, path, body, headers });
  const created = await call("POST", "/api/organiser/polls", {
    title: "Reopen and decide again", timeZone: "Europe/London",
    proposedDates: ["2026-10-10", "2026-10-17"].map(localDate => ({ kind: "date", localDate }))
  });
  const id = created.body.id;
  const management = `/api/organiser/polls/${id}`;
  const published = await call("POST", `${management}/publish`);
  const token = published.body.publicUrl.split("/").at(-1);
  const publicPath = `/api/public/polls/${token}`;
  const added = await call("POST", `${publicPath}/participants`, { displayName: "Alice" }, {});
  const first = added.body.proposedDates[0].id;
  const second = added.body.proposedDates[1].id;
  const closed = await call("POST", `${management}/close`, { selectedDateId: first, confirmed: true });
  assert.equal(closed.status, 200);
  return { app, call, id, management, publicPath, token, first, second, alice: added.body.participants[0].id };
}

for (const selection of ["same", "different"]) test(`S-024 restores collaboration then closes on the ${selection} date with preserved history`, async (t) => {
  const { app, call, id, management, publicPath, token, first, second, alice } = await fixture(t, selection);
  const before = await app.repository.getPoll(id);
  const originalEvents = await app.repository.listAuditEvents(id);
  const reopened = await call("POST", `${management}/reopen`, { confirmed: true });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.poll.status, "open");
  assert.equal(reopened.body.poll.selectedDateId, first);
  assert.equal(reopened.body.poll.provisional, true);
  assert.deepEqual(reopened.body.poll.participants.map(p => p.displayName), ["Alice"]);
  const stored = await app.repository.getPoll(id);
  assert.equal(stored.version, before.version + 1);
  assert.equal(stored.frozenRanking, undefined);
  assert.equal(stored.publicTokenHash, before.publicTokenHash);
  const events = await app.repository.listAuditEvents(id);
  assert.deepEqual(events.slice(0, -1), originalEvents);
  assert.equal(events.at(-1).action, "POLL_REOPENED");
  assert.equal(events.at(-1).revision, stored.version);
  assert.deepEqual(events.at(-1).before, { status: "closed", selectedDateId: first, ranking: before.frozenRanking });
  assert.deepEqual(events.at(-1).after, { status: "open", selectedDateId: first, provisional: true });
  assert.equal(events.at(-1).actorCategory, "organiser");
  const changed = await call("PUT", `${publicPath}/participants/${alice}`, { dateId: second, availability: "yes" }, {});
  assert.equal(changed.status, 200);
  assert.equal(changed.body.ranking[0].choiceId, second);
  assert.equal(changed.body.ranking[0].yesTotal, 1);
  assert.equal((await call("PUT", `${publicPath}/participants/${alice}`, { displayName: "Alicia" }, {})).status, 200);
  const added = await call("POST", `${publicPath}/participants`, { displayName: "Bob" }, {});
  assert.equal(added.status, 201);
  const bob = added.body.participants.find(p => p.displayName === "Bob");
  assert.equal((await call("DELETE", `${publicPath}/participants/${bob.id}`, { confirmation: "Bob" }, {})).status, 200);
  const live = await call("GET", publicPath, undefined, {});
  const selectedDateId = selection === "same" ? first : second;
  const closed = await call("POST", `${management}/close`, { selectedDateId, confirmed: true });
  assert.equal(closed.status, 200);
  assert.equal(closed.body.poll.status, "closed");
  assert.equal(closed.body.poll.selectedDateId, selectedDateId);
  assert.equal(closed.body.poll.provisional, undefined);
  assert.deepEqual(closed.body.poll.ranking, live.body.ranking);
  assert.deepEqual((await app.repository.getPoll(id)).frozenRanking, live.body.ranking);
  const finalEvents = await app.repository.listAuditEvents(id);
  assert.deepEqual(finalEvents.slice(0, events.length), events);
  const lifecycle = finalEvents.filter(e => ["POLL_CLOSED", "POLL_REOPENED"].includes(e.action));
  assert.deepEqual(lifecycle.map(e => e.action), ["POLL_CLOSED", "POLL_REOPENED", "POLL_CLOSED"]);
  assert.equal(new Set(lifecycle.map(e => e.id)).size, 3);
  assert.equal(new Set(lifecycle.map(e => e.revision)).size, 3);
  assert.equal(finalEvents.at(-1).revision, live.body.version + 1);
  assert.equal((await call("PUT", `${publicPath}/participants/${alice}`, { dateId: first, availability: "yes" }, {})).status, 422);
  const history = await call("GET", `${management}/history`);
  assert.deepEqual(history.body.items.filter(e => ["POLL_CLOSED", "POLL_REOPENED"].includes(e.action)).map(e => e.summary), ["Selected the final date and closed the poll", "Reopened the poll; the previous final date is provisional", "Selected the final date and closed the poll"]);
  assert.equal(JSON.stringify(history.body).includes(token), false);
  assert.equal(JSON.stringify(history.body).includes(before.publicTokenHash), false);
});

test("reopen rejects missing confirmation, unauthorised access, and invalid state without writes", async (t) => {
  const { app, call, id, management } = await fixture(t, "invalid");
  const before = await app.repository.getPoll(id);
  const events = await app.repository.listAuditEvents(id);
  for (const [body, headers, status] of [
    [undefined, owner, 400], [{ confirmed: false }, owner, 400], [{ confirmed: true, token: "secret" }, owner, 400],
    [{ confirmed: true }, {}, 401], [{ confirmed: true }, { "x-local-organiser-id": "local-organiser-other" }, 403]
  ]) assert.equal((await call("POST", `${management}/reopen`, body, headers)).status, status);
  assert.deepEqual(await app.repository.getPoll(id), before);
  assert.deepEqual(await app.repository.listAuditEvents(id), events);
  assert.equal((await call("POST", `${management}/reopen`, { confirmed: true })).status, 200);
  const open = await app.repository.getPoll(id);
  const openEvents = await app.repository.listAuditEvents(id);
  assert.equal((await call("POST", `${management}/reopen`, { confirmed: true })).status, 409);
  assert.deepEqual(await app.repository.getPoll(id), open);
  assert.deepEqual(await app.repository.listAuditEvents(id), openEvents);
});

test("concurrent reopen confirmations have one winner and one audit revision", async (t) => {
  const { app, call, id, management } = await fixture(t, "concurrent");
  const results = await Promise.all([1, 2].map(() => call("POST", `${management}/reopen`, { confirmed: true })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await app.repository.listAuditEvents(id)).filter(e => e.action === "POLL_REOPENED").length, 1);
});
