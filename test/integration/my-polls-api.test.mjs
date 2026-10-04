import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createHmac } from "node:crypto";
import { createLocalNodeServer } from "../../backend/dist/adapters/local/node-server.js";
import { PollService } from "../../backend/dist/application/poll-service.js";
import { ownedPollListResponseSchema, resolveOwnedPollListQuery } from "../../packages/contracts/dist/index.js";
import { selectOwnedPolls, toOwnedPollSummary } from "../../backend/dist/domain/my-polls.js";
import { dashboardFixture, dashboardOwners, dashboardSnapshot } from "../support/my-polls-fixture.mjs";
import { discoveryCases, discoveryFilters, expectedDiscovery } from "../support/my-polls-discovery-cases.mjs";

const path = "/api/organiser/polls";
const headers = { "x-local-organiser-id": dashboardOwners[0] };

test("T-119 every discovery mode has explicit ordered answers and denies unauthenticated/foreign continuations", async (t) => {
  let server;
  const { app, polls } = await dashboardFixture(t, { beforeCleanup: [async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }] });
  server = createLocalNodeServer(app.http);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}${path}`;
  const before = await dashboardSnapshot(app);
  const { createOrganiserLambdaHandler, createPublicLambdaHandler } = await import("../../backend/dist/functions/http-api.js");
  const service = new PollService(app.repository, { baseUrl: app.config.publicBaseUrl, tokenHashKey: "discovery-test",
    dashboardCursorSecret: app.config.dashboardCursorSecret });
  const organiser = createOrganiserLambdaHandler({ polls: service, repository: app.repository });
  const publicHandler = createPublicLambdaHandler({ polls: service, repository: app.repository });
  for (const [ownerIndex, owner] of dashboardOwners.entries()) {
    const foreignOwner = dashboardOwners[1 - ownerIndex];
    for (const filter of Object.keys(discoveryFilters)) {
      for (const { name, search, matches } of discoveryCases(ownerIndex ? "Olivia winter" : "Owen winter")) {
        const label = `${owner}: ${filter}: ${name}`;
        const expected = expectedDiscovery(polls, owner, filter, matches);
        const resolved = resolveOwnedPollListQuery({ filter, search, pageSize: 1 }).data;
        assert.deepEqual(selectOwnedPolls(polls, owner, resolved), expected, `${label}: pure rules`);
        const items = [];
        const cursors = new Set();
        let cursor;
        do {
          const params = new URLSearchParams({ filter, search, pageSize: "1", ...(cursor ? { cursor } : {}) });
          const response = await fetch(`${url}?${params}`, { headers: { "x-local-organiser-id": owner } });
          assert.equal(response.status, 200, label);
          assert.equal(response.headers.get("cache-control"), "private, no-store");
          const page = await response.json();
          assert.ok(ownedPollListResponseSchema.safeParse(page).success, label);
          assert.ok(page.items.length <= 1, label);
          items.push(...page.items);
          // Authentication must still precede cursor validation on every continuation.
          for (const deniedHeaders of [{}, { authorization: "Bearer public-token" }, { "x-local-organiser-id": "invalid" }]) {
            const denied = await fetch(`${url}?${params}`, { headers: deniedHeaders });
            assert.equal(denied.status, 401, label);
            assert.equal(denied.headers.get("cache-control"), "private, no-store");
            const body = await denied.json();
            assert.equal(body.error.code, "UNAUTHENTICATED", label);
            assert.equal(body.items, undefined, `${label}: no leaked summaries`);
          }
          const event = { rawPath: path, rawQueryString: params.toString(), headers: { "x-local-organiser-id": foreignOwner },
            requestContext: { http: { method: "GET" }, authorizer: { jwt: { claims: { sub: owner } } } } };
          const lambda = await organiser(event);
          assert.equal(lambda.statusCode, 200, label);
          assert.deepEqual(JSON.parse(lambda.body).items, page.items, `${label}: JWT identity overrides spoofed local header`);
          assert.equal(lambda.headers["cache-control"], "private, no-store");
          const noClaims = { ...event, requestContext: { http: { method: "GET" } } };
          const deniedLambda = await organiser(noClaims);
          assert.equal(deniedLambda.statusCode, 401, label);
          assert.equal(JSON.parse(deniedLambda.body).error.code, "UNAUTHENTICATED");
          assert.equal((await publicHandler(event)).statusCode, 404, `${label}: public adapter`);
          if (cursor) {
            const foreign = await fetch(`${url}?${params}`, { headers: { "x-local-organiser-id": foreignOwner } });
            assert.equal(foreign.status, 400, `${label}: owner-bound cursor`);
            assert.equal((await foreign.json()).error.code, "VALIDATION_ERROR");
            const foreignLambda = await organiser({ ...event,
              requestContext: { http: { method: "GET" }, authorizer: { jwt: { claims: { sub: foreignOwner } } } } });
            assert.equal(foreignLambda.statusCode, 400, `${label}: JWT owner-bound cursor`);
          }
          cursor = page.nextCursor;
          if (cursor) {
            assert.ok(!cursors.has(cursor), `${label}: cursor must advance`);
            cursors.add(cursor);
            assert.ok(cursors.size <= polls.length, `${label}: bounded traversal`);
          }
        } while (cursor);
        assert.deepEqual(items, expected.map((poll) => toOwnedPollSummary(poll, poll.participantCount)), label);
        assert.equal(new Set(items.map(({ id }) => id)).size, items.length, `${label}: no duplicates`);
        const params = new URLSearchParams({ filter, search, pageSize: "1" });
        const empty = await fetch(`${url}?${params}`, { headers: { "x-local-organiser-id": "local-organiser-empty" } });
        assert.equal(empty.status, 200, label);
        assert.deepEqual(await empty.json(), { items: [] }, `${label}: no access to either owner's polls`);
        params.set("ownerId", foreignOwner);
        const spoofed = await fetch(`${url}?${params}`, { headers: { "x-local-organiser-id": owner } });
        assert.equal(spoofed.status, 400, `${label}: claimed owner rejected`);
        assert.equal((await spoofed.json()).error.code, "VALIDATION_ERROR");
      }
    }
  }
  // Complete persisted rows include poll versions, creation-index keys and every audit revision.
  assert.deepEqual(await dashboardSnapshot(app), before);
});

test("HTTP list authenticates, validates raw queries, binds cursors and never mutates data (MP-US-02,11)", async (t) => {
  let server;
  const { app, polls } = await dashboardFixture(t, { beforeCleanup: [async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }] });
  server = createLocalNodeServer(app.http);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}${path}`;
  const before = await dashboardSnapshot(app);
  for (const requestHeaders of [{}, { authorization: "Bearer public-token" }, { "x-local-organiser-id": "invalid" }]) {
    const response = await fetch(url, { headers: requestHeaders });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "UNAUTHENTICATED");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  for (const owner of dashboardOwners) {
    for (const filter of ["active", "draft", "open", "closed"]) {
      for (const search of ["", "CAFE\u0301  autumn", "missing"]) {
        const query = resolveOwnedPollListQuery({ filter, search, pageSize: 1 }).data;
        const items = [];
        let cursor;
        do {
          const params = new URLSearchParams({ filter, search, pageSize: "1", ...(cursor ? { cursor } : {}) });
          const response = await fetch(`${url}?${params}`, { headers: { "x-local-organiser-id": owner } });
          assert.equal(response.status, 200);
          assert.equal(response.headers.get("cache-control"), "private, no-store");
          const page = await response.json();
          assert.ok(ownedPollListResponseSchema.safeParse(page).success);
          items.push(...page.items); cursor = page.nextCursor;
        } while (cursor);
        assert.deepEqual(items, selectOwnedPolls(polls, owner, query).map((poll) => toOwnedPollSummary(poll, poll.participantCount)));
      }
    }
  }
  for (const query of ["ownerId=other", "organiserId=other", "filter=draft&filter=open", "pageSize=01", "pageSize=1e1",
    "pageSize=0", "pageSize=51", "pageSize=1.0", "pageSize=+1", "filter=all", "cursor=bad", "search=" + "x".repeat(201)]) {
    const response = await fetch(`${url}?${query}`, { headers });
    assert.equal(response.status, 400, query);
    const body = await response.json();
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.ok(!JSON.stringify(body).includes("Owen"));
  }
  const first = await (await fetch(`${url}?pageSize=1`, { headers })).json();
  assert.ok(first.nextCursor);
  const cursor = first.nextCursor;
  const changed = `${cursor.slice(0, -2)}${cursor.at(-2) === "A" ? "B" : "A"}${cursor.at(-1)}`;
  for (const [suffix, identity] of [
    [`pageSize=1&cursor=${cursor}`, dashboardOwners[1]], [`pageSize=2&cursor=${cursor}`, dashboardOwners[0]],
    [`filter=closed&pageSize=1&cursor=${cursor}`, dashboardOwners[0]], [`search=other&pageSize=1&cursor=${cursor}`, dashboardOwners[0]],
    [`pageSize=1&cursor=${changed}`, dashboardOwners[0]]
  ]) {
    const response = await fetch(`${url}?${suffix}`, { headers: { "x-local-organiser-id": identity } });
    assert.equal(response.status, 400);
  }
  // Signed but expired / wrongly shaped keys are rejected independently of the MAC.
  const payload = JSON.parse(Buffer.from(cursor.split(".")[1], "base64url").toString());
  for (const altered of [{ ...payload, expiresAt: 1 }, { ...payload, key: { ...payload.key, GSI1PK: { S: "ORGANISER#foreign" } } }]) {
    const encoded = Buffer.from(JSON.stringify(altered)).toString("base64url");
    const mac = createHmac("sha256", app.config.dashboardCursorSecret).update(`v1.${encoded}`).digest("base64url");
    assert.equal((await fetch(`${url}?pageSize=1&cursor=v1.${encoded}.${mac}`, { headers })).status, 400);
  }
  const foreign = polls.find((poll) => poll.organiserId === dashboardOwners[1]);
  for (const method of ["GET", "PUT"]) {
    assert.equal((await app.http.handle({ method, path: `${path}/${foreign.id}`, headers, body: {} })).status, 403);
  }
  assert.equal((await app.http.handle({ method: "GET", path, headers, body: { ownerId: "foreign" } })).status, 400);
  assert.deepEqual(await dashboardSnapshot(app), before);
});

test("Lambda verified claims and raw query forwarding match local contracts; public adapter denies organiser list", async (t) => {
  const { createOrganiserLambdaHandler, createPublicLambdaHandler } = await import("../../backend/dist/functions/http-api.js");
  const { app } = await dashboardFixture(t);
  const polls = new PollService(app.repository, { baseUrl: app.config.publicBaseUrl, tokenHashKey: "lambda-test",
    dashboardCursorSecret: app.config.dashboardCursorSecret });
  const organiser = createOrganiserLambdaHandler({ polls, repository: app.repository });
  const publicHandler = createPublicLambdaHandler({ polls, repository: app.repository });
  const event = { rawPath: path, rawQueryString: "filter=closed&pageSize=1", headers,
    requestContext: { http: { method: "GET" }, authorizer: { jwt: { claims: { sub: dashboardOwners[1] } } } } };
  const response = await organiser(event);
  const local = await app.http.handle({ method: "GET", path, rawQuery: event.rawQueryString, headers: { "x-local-organiser-id": dashboardOwners[1] } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body).items, local.body.items);
  assert.equal(response.headers["cache-control"], "private, no-store");
  const missing = { ...event, requestContext: { http: { method: "GET" } } };
  assert.equal((await organiser(missing)).statusCode, 401);
  assert.equal((await publicHandler(event)).statusCode, 404);
  assert.equal((await organiser({ ...event, rawQueryString: "filter=open&filter=closed" })).statusCode, 400);
  const created = await polls.create({ title: "Public access", timeZone: "Europe/London", proposedDates: [
    { kind: "date", localDate: "2026-10-10" }, { kind: "date", localDate: "2026-10-11" }
  ] }, dashboardOwners[0]);
  const published = await polls.publish(created.id, dashboardOwners[0]);
  const publicEvent = { ...missing, rawPath: `/api/public/polls/${published.publicUrl.split("/").at(-1)}`, rawQueryString: "" };
  assert.equal((await publicHandler(publicEvent)).statusCode, 200);
  assert.equal((await organiser(publicEvent)).statusCode, 404);
});
