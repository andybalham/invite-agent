import { randomUUID } from "node:crypto";
import { DynamoDBClient, GetItemCommand, QueryCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";
import type { APIRequestContext, Page, Request, Response } from "@playwright/test";
import type { OwnedPollFilter, OwnedPollListResponse, PublicPollResponse } from "@invite-a-gent/contracts";
import type { PollRecord } from "../../backend/src/data/types";
import { ownedPollListResponseSchema, resolveOwnedPollListQuery } from "@invite-a-gent/contracts";
import { selectOwnedPolls } from "../../backend/src/domain/my-polls";
import { discoveryCases, discoveryFilters, discoveryTitle, expectedDiscovery } from "../support/my-polls-discovery-cases.mjs";
import { expect, test as base } from "./fixtures";

type Status = "draft" | "open" | "closed";
type SeededPoll = Pick<PollRecord, "id" | "title" | "createdAt"> & { status: Status; runId: string };
type Layout = "desktop" | "mobile";
type Store = { client: DynamoDBClient; appTableName: string; auditTableName: string };
const test = base.extend<{ store: Store }>({
  store: async ({}, use) => {
    const endpoint = process.env.DYNAMODB_ENDPOINT ?? `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`;
    const url = new URL(endpoint);
    expect(url.protocol).toBe("http:");
    expect(["127.0.0.1", "localhost"]).toContain(url.hostname);
    const client = new DynamoDBClient({ endpoint, region: "eu-west-2",
      credentials: { accessKeyId: "local", secretAccessKey: "local" } });
    try {
      await use({ client, appTableName: process.env.APP_TABLE_NAME ?? "invite-agent-local-app",
        auditTableName: process.env.AUDIT_TABLE_NAME ?? "invite-agent-local-audit" });
    } finally { client.destroy(); }
  }
});
const sharedTitle = "Autumn get-together";
const searchField = (page: Page) => page.getByRole("searchbox", { name: "Search poll titles", exact: true });
const filterButton = (page: Page, filter: OwnedPollFilter) => page.getByRole("group", { name: "Poll lifecycle" })
  .getByRole("button", { name: filter[0]!.toUpperCase() + filter.slice(1), exact: true });
const moreButton = (page: Page) => page.getByRole("button", { name: "Load more polls", exact: true });
const headers = (runId: string) => ({ "x-local-organiser-id": `local-organiser-${runId}` });
const newestFirst = (polls: SeededPoll[]) => [...polls].sort((a, b) => a.createdAt === b.createdAt
  ? (a.id === b.id ? 0 : a.id > b.id ? -1 : 1) : a.createdAt > b.createdAt ? -1 : 1);

async function seedPoll(request: APIRequestContext, store: Store, runId: string, title: string, status: Status): Promise<SeededPoll> {
  const created = await request.post("/api/organiser/polls", { headers: headers(runId), data: {
    title, description: "description-only-needle", location: "location-only-needle", timeZone: "Europe/London",
    proposedDates: [{ kind: "date", localDate: "2026-10-10" }, { kind: "date", localDate: "2026-10-17" }]
  } });
  expect(created.status()).toBe(201);
  const { id } = await created.json() as { id: string };
  const metadata = await store.client.send(new GetItemCommand({ TableName: store.appTableName,
    Key: { PK: { S: `POLL#${id}` }, SK: { S: "METADATA" } }, ConsistentRead: true }));
  expect(metadata.Item?.document?.S).toBeTruthy();
  const poll: PollRecord = JSON.parse(metadata.Item!.document!.S!);
  expect(poll.organiserId).toBe(headers(runId)["x-local-organiser-id"]);
  const path = `/api/organiser/polls/${poll.id}`;
  if (status !== "draft") expect((await request.post(`${path}/publish`, { headers: headers(runId) })).status()).toBe(200);
  if (status === "closed") {
    const current = await request.get(path, { headers: headers(runId) });
    expect(current.status()).toBe(200);
    const open: PublicPollResponse = await current.json();
    expect((await request.post(`${path}/close`, {
      headers: headers(runId), data: { selectedDateId: open.proposedDates[0]!.id, confirmed: true }
    })).status()).toBe(200);
  }
  return { id: poll.id, title: poll.title, createdAt: poll.createdAt, status, runId };
}

async function partition(store: Store, tableName: string, id: string) {
  const items: Record<string, AttributeValue>[] = [];
  let cursor: Record<string, AttributeValue> | undefined;
  do {
    const result = await store.client.send(new QueryCommand({ TableName: tableName, ConsistentRead: true,
      KeyConditionExpression: "PK = :pk", ExpressionAttributeValues: { ":pk": { S: `POLL#${id}` } },
      ExclusiveStartKey: cursor }));
    items.push(...(result.Items ?? []));
    cursor = result.LastEvaluatedKey;
  } while (cursor);
  return items;
}

async function snapshot(store: Store, polls: SeededPoll[]) {
  const snapshots = [];
  for (const poll of polls) {
    // Compare complete stored partitions, including metadata/index keys and every audit page.
    // Protected detail responses omit createdAt, so they cannot prove creation immutability.
    const appItems = await partition(store, store.appTableName, poll.id);
    const auditItems = await partition(store, store.auditTableName, poll.id);
    const metadata = appItems.find((item) => item.SK?.S === "METADATA")!;
    expect(metadata).toBeDefined();
    const record: PollRecord = JSON.parse(metadata.document!.S!);
    expect(record.organiserId).toBe(headers(poll.runId)["x-local-organiser-id"]);
    expect(auditItems).toHaveLength(record.version);
    snapshots.push({ id: poll.id, poll: record, appItems, auditItems });
  }
  return snapshots;
}

function observeApi(page: Page) {
  const requests: Request[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(request);
  });
  return requests;
}

function assertReads(requests: Request[], runId: string) {
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(request.method(), request.url()).toBe("GET");
    expect(request.postData()).toBeNull();
    expect(request.headers()["x-local-organiser-id"]).toBe(headers(runId)["x-local-organiser-id"]);
  }
}

async function queryResponse(page: Page, runId: string, filter: OwnedPollFilter, search: string,
  action: () => Promise<unknown>, cursor?: string): Promise<OwnedPollListResponse> {
  const response = page.waitForResponse((response: Response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/organiser/polls" && response.request().method() === "GET" &&
      url.searchParams.get("filter") === filter && url.searchParams.get("search") === search &&
      url.searchParams.get("cursor") === (cursor ?? null);
  });
  await action();
  const loaded = await response;
  expect(loaded.status()).toBe(200);
  expect(loaded.request().headers()["x-local-organiser-id"]).toBe(headers(runId)["x-local-organiser-id"]);
  expect(new URL(loaded.url()).searchParams.get("pageSize")).toBe("25");
  const body: OwnedPollListResponse = await loaded.json();
  expect(ownedPollListResponseSchema.safeParse(body).success).toBe(true);
  expect(loaded.headers()["cache-control"]).toBe("private, no-store");
  await expect(page.getByRole("region", { name: "Owned polls", exact: true })).toHaveAttribute("aria-busy", "false");
  await expect(searchField(page)).toHaveValue(search);
  for (const name of ["active", "draft", "open", "closed"] as const) {
    await expect(filterButton(page, name)).toHaveAttribute("aria-pressed", String(name === filter));
  }
  await expect(page).toHaveURL((url) => url.searchParams.get("testRunId") === runId &&
    (url.searchParams.get("filter") ?? "active") === filter && (url.searchParams.get("search") ?? "") === search);
  return body;
}

async function entries(page: Page, layout: Layout, expected: SeededPoll[]) {
  const container = page.locator(`.my-polls-${layout}`);
  const links = container.locator(layout === "desktop" ? "tbody a" : "h2 a");
  await expect(links).toHaveText(expected.map((poll) => poll.title));
  expect(await links.evaluateAll((links) => links.map((link) =>
    new URL((link as HTMLAnchorElement).href).searchParams.get("pollId")))).toEqual(expected.map((poll) => poll.id));
  await expect(container.locator(".summary-status")).toHaveText(expected.map(({ status }) =>
    status[0]!.toUpperCase() + status.slice(1)));
  if (expected.length) {
    await expect(container).toBeVisible();
    await expect(page.locator(`.my-polls-${layout === "desktop" ? "mobile" : "desktop"}`)).not.toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function returnToList(page: Page, runId: string, filter: OwnedPollFilter, search: string) {
  return queryResponse(page, runId, filter, search, () =>
    page.getByRole("link", { name: /^(?:←\s*)?My polls$/ }).click());
}

for (const [layout, viewport] of [
  ["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]
] as const) {
  test.describe(`My polls discovery on ${layout}`, () => {
    test.use({ viewport });

    test("T-119 pure rules, live API pages and keyboard controls agree for every discovery mode", async ({
      page, context, request, testRunId, store
    }) => {
      // Sixty real query modes per layout, including full page traversal and both auth boundaries.
      test.setTimeout(600_000);
      const runId = `${testRunId}-${randomUUID()}`;
      const own: SeededPoll[] = [];
      const other: SeededPoll[] = [];
      const foreignTitle = "Other owner's exclusive title";
      for (const status of ["draft", "open", "closed"] as const) {
        // Each lifecycle crosses the UI's 25-summary page boundary. Active spans three pages.
        for (let index = 0; index < 26; index += 1) {
          own.push(await seedPoll(request, store, runId, discoveryTitle, status));
        }
        own.push(await seedPoll(request, store, runId, `Winter ${status}`, status));
        other.push(await seedPoll(request, store, `${runId}-other`, discoveryTitle, status));
        other.push(await seedPoll(request, store, `${runId}-other`, foreignTitle, status));
      }
      const all = [...own, ...other];
      const before = await snapshot(store, all);
      const requests = observeApi(page);
      const unauthPage = await context.newPage();
      const unauthRequests = observeApi(unauthPage);
      try {
        const owner = headers(runId)["x-local-organiser-id"];
        const candidates = all.map((poll) => ({ ...poll, organiserId: headers(poll.runId)["x-local-organiser-id"] }));
        let body = await queryResponse(page, runId, "active", "", () => page.goto(`/?testRunId=${runId}`));
        await entries(page, layout, expectedDiscovery(candidates, owner, "active", "all").slice(0, 25));
        await expect(searchField(page)).toHaveAttribute("aria-controls", "my-polls-results");
        await expect(filterButton(page, "active")).toHaveAccessibleDescription("Active includes draft and open polls.");
        await searchField(page).focus();
        for (const filter of Object.keys(discoveryFilters) as OwnedPollFilter[]) {
          // Real tab traversal proves every lifecycle control is reachable in the live layout.
          await page.keyboard.press("Tab");
          await expect(filterButton(page, filter)).toBeFocused();
          await expect(filterButton(page, filter)).toHaveAttribute("aria-controls", "my-polls-results");
        }
        for (const filter of Object.keys(discoveryFilters) as OwnedPollFilter[]) {
          for (const [index, { name, search, matches }] of discoveryCases(foreignTitle).entries()) {
            await test.step(`${filter}: ${name}`, async () => {
              if (index === 0) {
                body = await queryResponse(page, runId, filter, search, async () => {
                  // Keyboard clearing retains the previous filter and returns focus to search.
                  if (await searchField(page).inputValue()) {
                    const clear = page.getByRole("button", { name: "Clear search", exact: true });
                    await clear.focus();
                    await clear.press("Enter");
                    await expect(searchField(page)).toBeFocused();
                  }
                  await filterButton(page, filter).focus();
                  await filterButton(page, filter).press(filter === "open" ? "Space" : "Enter");
                });
              } else {
                body = await queryResponse(page, runId, filter, search, () => searchField(page).fill(search));
              }
              const expected = expectedDiscovery(candidates, owner, filter, matches);
              const resolved = resolveOwnedPollListQuery({ filter, search, pageSize: 25 });
              expect(resolved.success).toBe(true);
              if (!resolved.success) throw new Error("Discovery query must resolve");
              expect(selectOwnedPolls(candidates, owner, resolved.data)).toEqual(expected);
              const accumulated: OwnedPollListResponse["items"] = [];
              const cursors = new Set<string>();
              do {
                expect(body.items).toHaveLength(Math.min(25, expected.length - accumulated.length));
                expect(body.items.map(({ id, title, status, createdAt }) => ({ id, title, status, createdAt })))
                  .toEqual(expected.slice(accumulated.length, accumulated.length + 25)
                    .map(({ id, title, status, createdAt }) => ({ id, title, status, createdAt })));
                accumulated.push(...body.items);
                await entries(page, layout, expected.slice(0, accumulated.length));
                if (!body.nextCursor) break;
                const cursor = body.nextCursor;
                expect(cursors.has(cursor)).toBe(false);
                cursors.add(cursor);
                expect(cursors.size).toBeLessThanOrEqual(4);
                const params = new URLSearchParams({ filter, search, pageSize: "25", cursor });
                const foreign = await request.get(`/api/organiser/polls?${params}`, { headers: headers(`${runId}-other`) });
                expect(foreign.status()).toBe(400);
                expect((await foreign.json()).error.code).toBe("VALIDATION_ERROR");
                const noAuth = await request.get(`/api/organiser/polls?${params}`);
                expect(noAuth.status()).toBe(401);
                expect((await noAuth.json()).error.code).toBe("UNAUTHENTICATED");
                body = await queryResponse(page, runId, filter, search, async () => {
                  await moreButton(page).focus();
                  await moreButton(page).press("Enter");
                }, cursor);
              } while (true);
              expect(accumulated.map(({ id }) => id)).toEqual(expected.map(({ id }) => id));
              expect(new Set(accumulated.map(({ id }) => id)).size).toBe(accumulated.length);
              await expect(moreButton(page)).not.toBeVisible();
              if (!expected.length) await expect(page.getByRole("status")).toHaveText("No polls match your search.");

              const params = new URLSearchParams({ filter, search, pageSize: "25" });
              // Another owner's valid first page must contain only that owner's IDs.
              const foreign = await request.get(`/api/organiser/polls?${params}`, { headers: headers(`${runId}-other`) });
              expect(foreign.status()).toBe(200);
              const foreignBody: OwnedPollListResponse = await foreign.json();
              const foreignMatches = name === "foreign title"
                ? other.filter((poll) => poll.title === foreignTitle && discoveryFilters[filter].includes(poll.status))
                : expectedDiscovery(candidates, headers(`${runId}-other`)["x-local-organiser-id"], filter, matches);
              expect(foreignBody.items.map(({ id }) => id)).toEqual(newestFirst(foreignMatches).map(({ id }) => id));
              for (const deniedHeaders of [{}, { authorization: "Bearer public-token" }]) {
                const denied = await request.get(`/api/organiser/polls?${params}`, { headers: deniedHeaders });
                expect(denied.status()).toBe(401);
                expect((await denied.json()).error.code).toBe("UNAUTHENTICATED");
              }
              // An explicit empty local identity exercises the existing unauthenticated UI boundary.
              const deniedResponse = unauthPage.waitForResponse((response) =>
                new URL(response.url()).pathname === "/api/organiser/polls");
              await unauthPage.goto(`/?${new URLSearchParams({ testRunId: "", filter, search })}`, { waitUntil: "domcontentloaded" });
              expect((await deniedResponse).status()).toBe(401);
              await expect(unauthPage.getByRole("alert")).toHaveText("Sign in to view your polls.");
              await expect(searchField(unauthPage)).toHaveValue(search);
              await expect(filterButton(unauthPage, filter)).toHaveAttribute("aria-pressed", "true");
              await entries(unauthPage, layout, []);
              await expect(moreButton(unauthPage)).not.toBeVisible();
              await expect(unauthPage.getByRole("status")).toBeEmpty();
            });
          }
        }
        assertReads(requests, runId);
        assertReads(unauthRequests, "");
        expect(await snapshot(store, all)).toEqual(before);
      } finally { await unauthPage.close(); }
    });

    test("lifecycle, resolved title search and navigation are read-only; editing retains creation order", async ({
      page, request, testRunId, store
    }) => {
      test.setTimeout(90_000);
      const runId = `${testRunId}-${randomUUID()}`;
      const own: SeededPoll[] = [];
      // Sequential real creates produce distinct immutable instants, independent of later publication/closure.
      for (const [title, status] of [
        [sharedTitle, "draft"], [sharedTitle, "open"], [sharedTitle, "closed"],
        ["Winter draft", "draft"], ["Winter dinner", "open"], ["Winter closed", "closed"],
        ["Café Autumn dinner", "open"]
      ] as const) own.push(await seedPoll(request, store, runId, title, status));
      expect(new Set(own.map(({ createdAt }) => createdAt)).size).toBe(own.length);
      const other = [await seedPoll(request, store, `${runId}-other`, sharedTitle, "open"),
        await seedPoll(request, store, `${runId}-other`, "Other owner's exclusive title", "open")];
      const all = [...own, ...other];
      const before = await snapshot(store, all);
      const requests = observeApi(page);
      const matching = (filter: OwnedPollFilter) => newestFirst(own.filter((poll) =>
        filter === "active" ? poll.status !== "closed" : poll.status === filter));
      const loaded = await queryResponse(page, runId, "active", "", () => page.goto(`/?testRunId=${runId}`));
      expect(loaded.items.map(({ id }) => id)).toEqual(matching("active").map(({ id }) => id));
      await entries(page, layout, matching("active"));

      for (const filter of ["draft", "open", "closed", "active"] as const) {
        await queryResponse(page, runId, filter, "", () => filterButton(page, filter).click());
        await entries(page, layout, matching(filter));
      }
      await queryResponse(page, runId, "active", sharedTitle, () => searchField(page).fill(sharedTitle));
      await entries(page, layout, matching("active").filter(({ title }) => title === sharedTitle));
      for (const filter of ["draft", "open", "closed"] as const) {
        await queryResponse(page, runId, filter, sharedTitle, () => filterButton(page, filter).click());
        const expected = matching(filter).filter(({ title }) => title === sharedTitle);
        await entries(page, layout, expected);
        // Open every lifecycle destination, then restore the originating filter/search without writes.
        await page.locator(`.my-polls-${layout} a[href*="pollId=${expected[0]!.id}"]`).click();
        await expect(page).toHaveURL((url) => url.searchParams.get("pollId") === expected[0]!.id &&
          url.searchParams.get("view") === (filter === "draft" ? "editor" : "manage"));
        if (filter === "draft") await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(sharedTitle);
        else await expect(page.getByTestId("public-state")).toHaveText(filter === "open" ? "Open" : "Closed");
        await returnToList(page, runId, filter, sharedTitle);
        await entries(page, layout, expected);
      }
      await queryResponse(page, runId, "closed", "", () => page.getByRole("button", { name: "Clear search", exact: true }).click());
      await entries(page, layout, matching("closed"));
      await expect(searchField(page)).toBeFocused();
      await expect(page.getByRole("button", { name: "Clear search", exact: true })).not.toBeVisible();
      await queryResponse(page, runId, "closed", "missing title", () => searchField(page).fill("missing title"));
      await entries(page, layout, []);
      await expect(page.locator(".my-polls-status")).toHaveText("No polls match your search.");
      await expect(page.getByRole("link", { name: "Create poll", exact: true })).toBeVisible();
      await queryResponse(page, runId, "closed", "Winter", () => searchField(page).fill("Winter"));
      await entries(page, layout, matching("closed").filter(({ title }) => title.includes("Winter")));
      await queryResponse(page, runId, "open", "Winter", () => filterButton(page, "open").click());
      await entries(page, layout, matching("open").filter(({ title }) => title.includes("Winter")));

      const cafe = own.find(({ title }) => title === "Café Autumn dinner")!;
      for (const [raw, expected] of [
        [cafe.title, [cafe]], ["CAFÉ AUTUMN DINNER", [cafe]], ["  CAFE\u0301\u0085\u2003 AUTUMN  ", [cafe]],
        ["Autumn", matching("open").filter(({ title }) => title.includes("Autumn"))],
        ["get-together", [own[1]!]], ["cafe", []], ["get together", []], ["caf.*", []],
        ["description-only-needle", []], ["location-only-needle", []], ["2026-10-10", []],
        [other[1]!.title, []], ["\u0085\u2003", matching("open")], ["", matching("open")]
      ] as Array<[string, SeededPoll[]]>) {
        await queryResponse(page, runId, "open", raw, () => searchField(page).fill(raw));
        await entries(page, layout, expected);
        if (!expected.length) await expect(page.locator(".my-polls-status")).toHaveText("No polls match your search.");
      }
      assertReads(requests, runId);
      expect(await snapshot(store, all)).toEqual(before);

      await queryResponse(page, runId, "active", "", () => filterButton(page, "active").click());
      await entries(page, layout, matching("active"));
      const oldest = own[0]!;
      await page.locator(`.my-polls-${layout} a[href*="pollId=${oldest.id}"]`).click();
      const title = page.getByRole("textbox", { name: "Title", exact: true });
      await expect(title).toHaveValue(oldest.title);
      // Navigating to the editor itself must still be read-only.
      assertReads(requests, runId);
      expect(await snapshot(store, all)).toEqual(before);
      const editedTitle = "Edited older Autumn get-together";
      await title.fill(editedTitle);
      const saved = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/organiser/polls/${oldest.id}` &&
        response.request().method() === "PUT");
      await page.getByRole("button", { name: "Save changes", exact: true }).click();
      expect((await saved).status()).toBe(200);
      await expect(page.getByTestId("draft-form").getByRole("status")).toContainText("saved");
      const afterEdit = await snapshot(store, all);
      expect(afterEdit[0]!.poll).toMatchObject({ title: editedTitle, createdAt: oldest.createdAt,
        status: "draft", version: before[0]!.poll.version + 1 });
      expect(afterEdit[0]!.appItems[0]!.GSI1SK).toEqual(before[0]!.appItems[0]!.GSI1SK);
      expect(afterEdit[0]!.auditItems).toHaveLength(before[0]!.auditItems.length + 1);
      expect(afterEdit[0]!.auditItems.at(-1)!.action!.S).toBe("POLL_DETAILS_UPDATED");
      expect(afterEdit[0]!.auditItems.slice(0, -1)).toEqual(before[0]!.auditItems);
      expect(afterEdit.slice(1)).toEqual(before.slice(1));
      expect(requests.filter((request) => request.method() !== "GET").map((request) => request.method())).toEqual(["PUT"]);
      requests.length = 0;
      oldest.title = editedTitle;
      const returned = await returnToList(page, runId, "active", "");
      expect(returned.items.find(({ id }) => id === oldest.id)!.createdAt).toBe(oldest.createdAt);
      await entries(page, layout, matching("active"));
      expect(returned.items.at(-1)!.id).toBe(oldest.id);
      assertReads(requests, runId);
      expect(await snapshot(store, all)).toEqual(afterEdit);
    });

    test("sparse database continuations and API pages preserve search, ownership and creation order", async ({
      page, request, testRunId, store
    }) => {
      test.setTimeout(180_000);
      const runId = `${testRunId}-${randomUUID()}`;
      const matches: SeededPoll[] = [];
      for (let index = 0; index < 26; index += 1) {
        matches.push(await seedPoll(request, store, runId, `Archive match ${String(index).padStart(2, "0")}`, "open"));
      }
      const closed = await seedPoll(request, store, runId, "Archive match closed", "closed");
      const other = await seedPoll(request, store, `${runId}-other`, matches[0]!.title, "open");
      const distractions: SeededPoll[] = [];
      // More than the repository's 200-candidate budget: older matches require an empty API page
      // with a continuation, then span two matching API pages (25 + 1), without mocked responses.
      for (let index = 0; index < 201; index += 1) {
        distractions.push(await seedPoll(request, store, runId, `Recent distraction ${String(index).padStart(3, "0")}`, "draft"));
      }
      const all = [...matches, closed, other, ...distractions];
      expect(new Set(all.map(({ createdAt }) => createdAt)).size).toBe(all.length);
      const before = await snapshot(store, all);
      const requests = observeApi(page);
      const recent = newestFirst(distractions);
      let body = await queryResponse(page, runId, "active", "", () => page.goto(`/?testRunId=${runId}`));
      await entries(page, layout, recent.slice(0, 25));
      expect(body.nextCursor).toBeTruthy();
      body = await queryResponse(page, runId, "active", "", () => moreButton(page).click(), body.nextCursor!);
      await entries(page, layout, recent.slice(0, 50));

      const ordered = newestFirst(matches);
      for (const filter of ["active", "open"] as const) {
        body = await queryResponse(page, runId, filter, "Archive match", () => filter === "active"
          ? searchField(page).fill("Archive match") : filterButton(page, filter).click());
        expect(body.items).toEqual([]);
        expect(body.nextCursor).toBeTruthy();
        await entries(page, layout, []);
        await expect(page.locator(".my-polls-status")).toHaveText("More polls may match.");
        await expect(moreButton(page)).toBeVisible();
        body = await queryResponse(page, runId, filter, "Archive match", () => moreButton(page).click(), body.nextCursor!);
        expect(body.items.map(({ id }) => id)).toEqual(ordered.slice(0, 25).map(({ id }) => id));
        expect(body.nextCursor).toBeTruthy();
        await entries(page, layout, ordered.slice(0, 25));
        body = await queryResponse(page, runId, filter, "Archive match", () => moreButton(page).click(), body.nextCursor!);
        expect(body.items.map(({ id }) => id)).toEqual([ordered[25]!.id]);
        expect(body.nextCursor).toBeUndefined();
        await entries(page, layout, ordered);
        await expect(moreButton(page)).not.toBeVisible();
      }
      // The oldest matching title can be opened from page two. Return refreshes page one
      // while retaining the query, so accumulated entries/cursors cannot survive navigation.
      await page.locator(`.my-polls-${layout} a[href*="pollId=${matches[0]!.id}"]`).click();
      await expect(page.getByRole("heading", { name: matches[0]!.title, exact: true })).toBeVisible();
      body = await returnToList(page, runId, "open", "Archive match");
      expect(body.items).toEqual([]);
      await entries(page, layout, []);
      await expect(page.locator(".my-polls-status")).toHaveText("More polls may match.");
      await queryResponse(page, runId, "closed", "Archive match", () => filterButton(page, "closed").click());
      await entries(page, layout, []);
      body = await queryResponse(page, runId, "closed", "", () =>
        page.getByRole("button", { name: "Clear search", exact: true }).click());
      expect(body.items).toEqual([]);
      expect(body.nextCursor).toBeTruthy();
      await expect(searchField(page)).toBeFocused();
      body = await queryResponse(page, runId, "closed", "", () => moreButton(page).click(), body.nextCursor!);
      expect(body.nextCursor).toBeUndefined();
      await entries(page, layout, [closed]);
      assertReads(requests, runId);
      expect(await snapshot(store, all)).toEqual(before);
    });
  });
}
