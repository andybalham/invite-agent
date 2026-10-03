import assert from "node:assert/strict";
import test from "node:test";
import { createIntegrationApp } from "../support/integration-fixture.mjs";
import { createLocalComposition } from "../../backend/dist/adapters/local/composition.js";

const run = `location-${process.pid}-${Date.now()}`;
async function fixture(t, state, name) {
  const app = await createIntegrationApp(t, createLocalComposition, {
    appEnv: "test", authMode: "local", awsRegion: "eu-west-2",
    dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT ?? "http://127.0.0.1:18000",
    appTableName: `${run}-${state}-${name}-app`, auditTableName: `${run}-${state}-${name}-audit`,
    publicBaseUrl: "http://127.0.0.1:15173", publicTokenHashKey: "location-test-key"
  });
  const owner = { "x-local-organiser-id": "local-organiser-location-owner" };
  const created = await app.http.handle({ method: "POST", path: "/api/organiser/polls", headers: owner, body: {
    title: "Venue planning", timeZone: "Europe/London",
    proposedDates: [{ kind: "date", localDate: "2026-10-10" }, { kind: "date", localDate: "2026-10-17" }]
  } });
  assert.equal(created.status, 201);
  const id = created.body.id;
  let token;
  if (state !== "draft") {
    const published = await app.http.handle({ method: "POST", path: `/api/organiser/polls/${id}/publish`, headers: owner });
    assert.equal(published.status, 200);
    token = published.body.publicUrl.split("/").at(-1);
    if (state === "closed") {
      const closed = await app.http.handle({ method: "POST", path: `/api/organiser/polls/${id}/close`, headers: owner,
        body: { selectedDateId: `${id}-date-2`, confirmed: true } });
      assert.equal(closed.status, 200);
    }
  }
  const path = `/api/organiser/polls/${id}/location`;
  const save = (location, headers = owner) => app.http.handle({ method: "PUT", path, headers, body: { location } });
  const snapshot = async () => ({ poll: await app.repository.getPoll(id), audit: await app.repository.listAuditEvents(id) });
  return { app, id, owner, token, save, snapshot };
}

// S-023 / US-35–US-38: all lifecycle states share the same owner-only safe mutation.
for (const state of ["draft", "open", "closed"]) {
  test(`${state}: owner sets, edits, and clears location with exactly one before/after revision each`, async (t) => {
    const context = await fixture(t, state, "success");
    const initial = await context.snapshot();
    let previous = "";
    for (const location of ["Community Hall", "**Riverside Room** — [map](https://example.test/map?a=1&b=2)", ""]) {
      const before = await context.snapshot();
      const result = await context.save(location);
      assert.equal(result.status, 200);
      const after = await context.snapshot();
      assert.equal(after.poll.status, state);
      assert.equal(after.poll.location ?? "", location);
      assert.equal(after.poll.version, before.poll.version + 1);
      assert.equal(after.audit.length, before.audit.length + 1);
      assert.deepEqual(after.audit.slice(0, -1), before.audit);
      const event = after.audit.at(-1);
      assert.deepEqual(event.before, { location: previous });
      assert.deepEqual(event.after, { location });
      assert.equal(event.action, "LOCATION_CHANGED");
      assert.equal(event.actorId, context.owner["x-local-organiser-id"]);
      assert.equal(event.revision, after.poll.version);
      assert.deepEqual(after.poll.proposedDates, initial.poll.proposedDates);
      assert.deepEqual(after.poll.frozenRanking, initial.poll.frozenRanking);
      assert.equal(after.poll.selectedDateId, initial.poll.selectedDateId);
      const surface = await context.app.http.handle({ method: "GET", headers: context.owner,
        path: context.token ? `/api/public/polls/${context.token}` : `/api/organiser/polls/${context.id}` });
      assert.equal(surface.status, 200);
      assert.equal(surface.body.location ?? "", location);
      if (location.includes("[map]")) {
        assert.match(surface.body.locationHtml, /<strong>Riverside Room<\/strong>/);
        assert.match(surface.body.locationHtml, /rel="noopener noreferrer"/);
        assert.match(surface.body.locationHtml, /a=1&amp;b=2/);
      }
      if (!location) assert.equal(surface.body.locationHtml ?? "", "");
      assert.equal(JSON.stringify(after.audit).includes(context.token ?? "nonexistent-token"), false);
      previous = location;
    }
  });

  test(`${state}: invalid input and unauthorized set/edit/clear preserve poll and history`, async (t) => {
    const context = await fixture(t, state, "reject");
    assert.equal((await context.save("Community Hall")).status, 200);
    const before = await context.snapshot();
    for (const location of ["😀".repeat(4_001), "[bad](javascript:alert(1))", "<script>alert(1)</script>", "**unfinished", "[bad](http://example.test)"]) {
      const response = await context.save(location);
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "VALIDATION_ERROR");
      assert.match(response.body.error.message, /location|Markdown|HTML|HTTPS|characters/i);
      assert.deepEqual(await context.snapshot(), before);
    }
    for (const headers of [{}, { "x-local-organiser-id": "local-organiser-other" }]) {
      for (const location of ["Community Hall", "Riverside Room", ""]) {
        const response = await context.save(location, headers);
        assert.equal(response.status, Object.keys(headers).length ? 403 : 401);
        assert.equal(response.body.error.code, Object.keys(headers).length ? "FORBIDDEN" : "UNAUTHENTICATED");
        assert.equal(JSON.stringify(response.body).includes("Community Hall"), false);
        assert.deepEqual(await context.snapshot(), before);
      }
    }
    if (context.token) {
      const response = await context.app.http.handle({ method: "PUT", path: `/api/public/polls/${context.token}/location`, headers: {}, body: { location: "Public bypass" } });
      assert.equal(response.status, 404);
      assert.deepEqual(await context.snapshot(), before);
    }
  });

  test(`${state}: concurrent location updates serialize their before/after history`, async (t) => {
    const context = await fixture(t, state, "concurrent");
    const before = await context.snapshot();
    const results = await Promise.all([context.save("Venue A"), context.save("Venue B")]);
    assert.deepEqual(results.map(({ status }) => status), [200, 200]);
    const after = await context.snapshot();
    const events = after.audit.slice(before.audit.length);
    assert.equal(events.length, 2);
    assert.equal(after.poll.version, before.poll.version + 2);
    assert.deepEqual(events[0].before, { location: "" });
    assert.deepEqual(events[1].before, events[0].after);
    assert.deepEqual(events[1].after, { location: after.poll.location });
    assert.equal(after.poll.status, state);
  });
}
