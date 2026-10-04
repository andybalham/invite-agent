import { randomUUID } from "node:crypto";
import { DynamoDBClient, QueryCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";
import type { Page, Request } from "@playwright/test";
import type { OwnedPollFilter, OwnedPollListResponse, PublicPollResponse } from "@invite-a-gent/contracts";
import type { PollRecord } from "../../backend/src/data/types";
import { expect, test as base } from "./fixtures";

type Store = { client: DynamoDBClient; appTable: string; auditTable: string };
type Layout = "desktop" | "mobile";
type SavedPoll = { id: string; title: string; createdAt: string; creationKey: string };
type ExpectedPoll = SavedPoll & { status: "draft" | "open" | "closed"; count: number };

const test = base.extend<{ store: Store }>({
  store: async ({}, use) => {
    const endpoint = process.env.DYNAMODB_ENDPOINT ?? `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "18000"}`;
    const url = new URL(endpoint);
    expect(url.protocol).toBe("http:");
    expect(["127.0.0.1", "localhost"]).toContain(url.hostname);
    const client = new DynamoDBClient({ endpoint, region: "eu-west-2",
      credentials: { accessKeyId: "local", secretAccessKey: "local" } });
    try {
      await use({ client, appTable: process.env.APP_TABLE_NAME ?? "invite-agent-local-app",
        auditTable: process.env.AUDIT_TABLE_NAME ?? "invite-agent-local-audit" });
    } finally { client.destroy(); }
  }
});

async function partition(store: Store, table: string, id: string) {
  const items: Record<string, AttributeValue>[] = [];
  let cursor: Record<string, AttributeValue> | undefined;
  do {
    const result = await store.client.send(new QueryCommand({ TableName: table, ConsistentRead: true,
      KeyConditionExpression: "PK = :pk", ExpressionAttributeValues: { ":pk": { S: `POLL#${id}` } },
      ExclusiveStartKey: cursor }));
    items.push(...(result.Items ?? []));
    cursor = result.LastEvaluatedKey;
  } while (cursor);
  return items;
}

async function snapshot(store: Store, id: string) {
  const app = await partition(store, store.appTable, id);
  const audit = (await partition(store, store.auditTable, id))
    .sort((a, b) => Number(a.revision!.N) - Number(b.revision!.N));
  const metadata = app.find((item) => item.SK?.S === "METADATA")!;
  expect(metadata).toBeDefined();
  const poll: PollRecord = JSON.parse(metadata.document!.S!);
  expect(audit.map((item) => Number(item.revision!.N)))
    .toEqual(Array.from({ length: poll.version }, (_, index) => index + 1));
  expect(metadata.GSI1SK?.S).toBe(`POLL#${poll.createdAt}#${id}`);
  return { app, audit, poll, creationKey: metadata.GSI1SK!.S! };
}

function observeApi(page: Page) {
  const requests: Request[] = [];
  const listener = (request: Request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(request);
  };
  page.on("request", listener);
  return { requests, stop: () => page.off("request", listener) };
}

async function readOnly(store: Store, polls: SavedPoll[], pages: Page[], action: () => Promise<unknown>) {
  const before = await Promise.all(polls.map(({ id }) => snapshot(store, id)));
  const observers = pages.map(observeApi);
  try {
    await action();
    const reads = observers.flatMap(({ requests }) => requests);
    for (const request of reads) {
      expect(request.method(), request.url()).toBe("GET");
      expect(request.postData()).toBeNull();
    }
    expect(await Promise.all(polls.map(({ id }) => snapshot(store, id)))).toEqual(before);
  } finally {
    for (const observer of observers) observer.stop();
  }
}

async function mutation(store: Store, poll: SavedPoll, actions: string[], category: string,
  action: () => Promise<unknown>) {
  const before = await snapshot(store, poll.id);
  await action();
  const after = await snapshot(store, poll.id);
  expect(after.poll.createdAt).toBe(poll.createdAt);
  expect(after.creationKey).toBe(poll.creationKey);
  expect(after.poll.version).toBe(before.poll.version + actions.length);
  expect(after.audit.slice(0, before.audit.length)).toEqual(before.audit);
  const added = after.audit.slice(before.audit.length);
  expect(added.map((event) => event.action!.S)).toEqual(actions);
  expect(added.map((event) => event.actorCategory!.S)).toEqual(actions.map(() => category));
  return after;
}

function listLinks(page: Page, layout: Layout) {
  return page.locator(layout === "desktop" ? ".my-polls-desktop tbody a" : ".my-polls-mobile h2 a");
}

async function list(page: Page, layout: Layout, runId: string, filter: OwnedPollFilter,
  expected: ExpectedPoll[], action: () => Promise<unknown>) {
  const response = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/organiser/polls" && response.request().method() === "GET" &&
      url.searchParams.get("filter") === filter && url.searchParams.get("search") === "" &&
      !url.searchParams.has("cursor");
  });
  await action();
  const loaded = await response;
  expect(loaded.status()).toBe(200);
  expect(loaded.request().headers()["x-local-organiser-id"]).toBe(`local-organiser-${runId}`);
  expect(loaded.headers()["cache-control"]).toBe("private, no-store");
  const body: OwnedPollListResponse = await loaded.json();
  expect(body.nextCursor).toBeUndefined();
  // Expected membership/order is supplied explicitly, independently of the production filter/sort.
  expect(body.items.map(({ id, title, status, createdAt, participantCount }) =>
    ({ id, title, status, createdAt, count: participantCount })))
    .toEqual(expected.map(({ id, title, status, createdAt, count }) => ({ id, title, status, createdAt, count })));
  await expect(page.getByRole("heading", { name: "My polls", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Owned polls", exact: true })).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("button", { name: filter[0]!.toUpperCase() + filter.slice(1), exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("searchbox", { name: "Search poll titles", exact: true })).toHaveValue("");
  await expect(page).toHaveURL((url) => url.pathname === "/" && url.searchParams.get("testRunId") === runId &&
    (url.searchParams.get("filter") ?? "active") === filter && !url.searchParams.has("pollId"));
  const links = listLinks(page, layout);
  await expect(links).toHaveText(expected.map(({ title }) => title));
  expect(await links.evaluateAll((links) => links.map((link) =>
    new URL((link as HTMLAnchorElement).href).searchParams.get("pollId")))).toEqual(expected.map(({ id }) => id));
  for (const poll of expected) {
    const row = page.locator(layout === "desktop" ? ".my-polls-desktop tbody tr" : ".my-polls-mobile article")
      .filter({ has: page.getByRole("link", { name: poll.title, exact: true }) });
    await expect(row).toBeVisible();
    await expect(row.locator(".summary-status")).toHaveText(poll.status[0]!.toUpperCase() + poll.status.slice(1));
    const creation = new Intl.DateTimeFormat("en-GB", {
      day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London"
    }).format(new Date(poll.createdAt));
    await expect(row.getByText(creation, { exact: true })).toBeVisible();
    await expect(row.getByText(`${poll.count} ${poll.count === 1 ? "participant" : "participants"}`, { exact: true }))
      .toBeVisible();
    await expect(row.locator(".my-polls-dates li")).toHaveText(["Sat, 10 Oct 2026", "Sat, 17 Oct 2026"]);
  }
  if (expected.length) await expect(page.locator(`.my-polls-${layout === "desktop" ? "mobile" : "desktop"}`)).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

const returnLink = (page: Page) => page.getByRole("link", { name: /^(?:←\s*)?My polls$/ });
const filterClick = (page: Page, filter: string) => () => page.getByRole("button", { name: filter, exact: true }).click();

async function create(page: Page, store: Store, title: string, runId: string): Promise<SavedPoll> {
  await page.getByRole("link", { name: "Create poll", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New poll", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
  for (const date of ["2026-10-10", "2026-10-17"]) {
    await page.getByLabel("New proposed date").fill(date);
    await page.getByLabel("New proposed time").fill("");
    await page.getByRole("button", { name: "Add date", exact: true }).click();
  }
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByTestId("draft-form").getByRole("status")).toHaveText("Draft saved.");
  await expect(page).toHaveURL((url) => url.searchParams.get("view") === "editor" && Boolean(url.searchParams.get("pollId")));
  const id = new URL(page.url()).searchParams.get("pollId")!;
  const saved = await snapshot(store, id);
  expect(saved.poll).toMatchObject({ title, status: "draft", participantCount: 0, version: 1,
    organiserId: `local-organiser-${runId}` });
  expect(saved.audit.map((event) => event.action!.S)).toEqual(["POLL_CREATED"]);
  expect(saved.audit[0]!.actorCategory!.S).toBe("organiser");
  return { id, title, createdAt: saved.poll.createdAt, creationKey: saved.creationKey };
}

async function management(page: Page, poll: SavedPoll, status: "open" | "closed") {
  await expect(page.getByRole("heading", { name: poll.title, exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Organiser controls" })).toBeVisible();
  await expect(page.getByTestId("public-state")).toHaveText(status === "open" ? "Open" : "Closed");
  await expect(returnLink(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "My polls", exact: true })).not.toBeVisible();
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).not.toBeVisible();
  await expect(page).toHaveURL((url) => url.searchParams.get("pollId") === poll.id && url.searchParams.get("view") === "manage");
}

async function publicLink(page: Page, publicUrl: string, poll: SavedPoll, status: "open" | "closed") {
  const observer = observeApi(page);
  await page.goto(publicUrl);
  await expect(page).toHaveURL(publicUrl);
  await expect(page.getByRole("heading", { name: poll.title, exact: true })).toBeVisible();
  await expect(page.getByTestId("public-state")).toHaveText(status === "open" ? "Open" : "Closed");
  await expect(page.getByRole("region", { name: "Organiser controls" })).not.toBeVisible();
  await expect(page.getByRole("link", { name: /My polls|History/ })).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "My polls", exact: true })).not.toBeVisible();
  if (status === "open") await expect(page.getByRole("button", { name: "+ Add a row", exact: true })).toBeVisible();
  else {
    await expect(page.getByText("This poll is closed. Responses are read-only.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add a row|Actions for|^Alice,|^Bob,/ })).toHaveCount(0);
  }
  observer.stop();
  expect(observer.requests.length).toBeGreaterThan(0);
  for (const request of observer.requests) {
    expect(new URL(request.url()).pathname).toMatch(/^\/api\/public\//);
    expect(request.method()).toBe("GET");
    expect(request.headers()["x-local-organiser-id"]).toBeUndefined();
  }
  // Probe in the link-holder browser, including an explicit attempt to use its capability as auth.
  const denied = await page.evaluate(async (token) => {
    const results = [];
    for (const headers of [{}, { authorization: `Bearer ${token}`, "x-public-link-token": token }]) {
      const response = await fetch("/api/organiser/polls?filter=active", { headers });
      results.push({ status: response.status, body: await response.json() });
    }
    return results;
  }, new URL(publicUrl).pathname.split("/").at(-1)!);
  for (const result of denied) {
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHENTICATED");
    expect(result.body.items).toBeUndefined();
    expect(JSON.stringify(result.body)).not.toContain(poll.id);
    expect(JSON.stringify(result.body)).not.toContain(poll.title);
  }
}

async function addParticipant(page: Page, name: string) {
  await page.getByRole("button", { name: "+ Add a row", exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  await expect(page.getByRole("rowheader", { name, exact: true })).toBeVisible();
}

for (const [layout, viewport] of [
  ["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]
] as const) {
  test.describe(`My polls lifecycle on ${layout}`, () => {
    test.use({ viewport });
    test("T-123 MP-US-07–11 UI creation, collaboration, close/reopen and public-link isolation", async ({
      page, context, browser, testRunId, store
    }) => {
      test.setTimeout(120_000);
      const runId = `${testRunId}-${randomUUID()}`;
      const participantContext = await browser.newContext({ viewport });
      expect(participantContext).not.toBe(context);
      const participant = await participantContext.newPage();
      const polls: SavedPoll[] = [];
      const reads = (action: () => Promise<unknown>) => readOnly(store, polls, [page, participant], action);
      try {
        await list(page, layout, runId, "active", [], () => page.goto(`/?testRunId=${runId}`));
        const older = await create(page, store, "Lifecycle dinner", runId);
        polls.push(older);
        const expected = (poll: SavedPoll, status: ExpectedPoll["status"], count = 0): ExpectedPoll => ({ ...poll, status, count });
        await reads(() => list(page, layout, runId, "active", [expected(older, "draft")], () => returnLink(page).click()));
        const newer = await create(page, store, "Newer untouched draft", runId);
        polls.push(newer);
        expect(newer.createdAt > older.createdAt).toBe(true);
        const newerBefore = await snapshot(store, newer.id);
        await reads(() => list(page, layout, runId, "active", [expected(newer, "draft"), expected(older, "draft")],
          () => returnLink(page).click()));

        await reads(async () => {
          await listLinks(page, layout).getByText(older.title, { exact: true }).click();
          await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(older.title);
          await expect(page.getByRole("textbox", { name: "Title", exact: true })).toBeEditable();
          await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeVisible();
          await expect(returnLink(page)).toBeVisible();
          await expect(page).toHaveURL((url) => url.searchParams.get("pollId") === older.id && url.searchParams.get("view") === "editor");
        });
        await mutation(store, older, ["POLL_DETAILS_UPDATED"], "organiser", async () => {
          await page.getByRole("textbox", { name: "Title", exact: true }).fill("Saved lifecycle dinner");
          await page.getByRole("button", { name: "Save changes", exact: true }).click();
          await expect(page.getByTestId("draft-form").getByRole("status")).toHaveText("Changes saved.");
        });
        older.title = "Saved lifecycle dinner";
        await reads(() => list(page, layout, runId, "active", [expected(newer, "draft"), expected(older, "draft")],
          () => returnLink(page).click()));
        await reads(async () => {
          await listLinks(page, layout).getByText(older.title, { exact: true }).click();
          await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(older.title);
        });
        let publicUrl = "";
        // Publish deliberately saves the current draft first: two existing, separate audit mutations.
        await mutation(store, older, ["POLL_DETAILS_UPDATED", "POLL_PUBLISHED"], "organiser", async () => {
          await page.getByRole("button", { name: "Publish", exact: true }).click();
          await management(page, older, "open");
          publicUrl = await page.getByLabel("Public poll link", { exact: true }).inputValue();
          expect(new URL(publicUrl).pathname).toMatch(/^\/p\/[A-Za-z0-9_-]{32}$/);
          await expect(page.getByRole("region", { name: "Share this poll", exact: true })).toBeVisible();
        });
        await reads(() => publicLink(participant, publicUrl, older, "open"));
        await mutation(store, older, ["PARTICIPANT_ADDED"], "anonymous-link-holder", () => addParticipant(participant, "Alice"));
        // The organiser's live public table and the independent link holder collaborate on the same poll.
        await expect(page.getByRole("rowheader", { name: "Alice", exact: true })).toBeVisible();
        await mutation(store, older, ["PARTICIPANT_ADDED"], "anonymous-link-holder", () => addParticipant(page, "Bob"));
        await expect(participant.getByRole("rowheader", { name: "Bob", exact: true })).toBeVisible();
        await mutation(store, older, ["AVAILABILITY_CHANGED"], "anonymous-link-holder", async () => {
          await participant.getByRole("button", { name: "Bob, Sat 10 Oct: No", exact: true }).click();
          await expect(participant.getByRole("button", { name: "Bob, Sat 10 Oct: Yes", exact: true })).toBeVisible();
        });
        await expect(page.getByRole("button", { name: "Bob, Sat 10 Oct: Yes", exact: true })).toBeVisible();
        await reads(async () => {
          await list(page, layout, runId, "active", [expected(newer, "draft"), expected(older, "open", 2)], () => returnLink(page).click());
          await list(page, layout, runId, "open", [expected(older, "open", 2)], filterClick(page, "Open"));
          await listLinks(page, layout).getByText(older.title, { exact: true }).click();
          await management(page, older, "open");
        });

        await reads(async () => {
          await page.locator("button[data-close-choice-id]").first().click();
          const dialog = page.getByRole("dialog", { name: "Final date", exact: true });
          await expect(dialog).toContainText("Saturday 10 October 2026");
          await expect(dialog).toContainText("Yes · 1");
          await expect(dialog).toContainText("No · 1");
          await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
          await expect(dialog).not.toBeVisible();
        });
        const selectedDateId = await page.locator("button[data-close-choice-id]").first().getAttribute("data-close-choice-id");
        expect(selectedDateId).toBeTruthy();
        const closed = await mutation(store, older, ["POLL_CLOSED"], "organiser", async () => {
          await page.locator("button[data-close-choice-id]").first().click();
          await page.getByRole("dialog", { name: "Final date", exact: true })
            .getByRole("button", { name: "Confirm & close poll", exact: true }).click();
          await management(page, older, "closed");
        });
        expect(closed.poll.selectedDateId).toBe(selectedDateId);
        expect(closed.poll.frozenRanking).toBeDefined();
        await reads(async () => {
          await list(page, layout, runId, "open", [], () => returnLink(page).click());
          await list(page, layout, runId, "active", [expected(newer, "draft")], filterClick(page, "Active"));
          await list(page, layout, runId, "closed", [expected(older, "closed", 2)], filterClick(page, "Closed"));
          await publicLink(participant, publicUrl, older, "closed");
          await expect(participant.getByRole("rowheader", { name: "Alice", exact: true })).toBeVisible();
          await expect(participant.getByRole("rowheader", { name: "Bob", exact: true })).toBeVisible();
        });
        // Hidden controls are also enforced by the server; rejected participant writes add no revisions.
        const beforeDenied = await snapshot(store, older.id);
        const denied = await participant.evaluate(async (token) => {
          const path = `/api/public/polls/${token}`;
          const poll: PublicPollResponse = await (await fetch(path)).json();
          const id = poll.participants[0]!.id;
          const results = [];
          for (const [method, suffix, body] of [
            ["POST", "/participants", { displayName: "Forbidden" }],
            ["PUT", `/participants/${id}`, { displayName: "Forbidden rename" }],
            ["PUT", `/participants/${id}`, { dateId: poll.proposedDates[0]!.id, availability: "yes" }],
            ["DELETE", `/participants/${id}`, { confirmation: poll.participants[0]!.displayName }]
          ] as const) {
            const response = await fetch(path + suffix, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
            results.push({ status: response.status, body: await response.json() });
          }
          return results;
        }, new URL(publicUrl).pathname.split("/").at(-1)!);
        expect(denied).toHaveLength(4);
        for (const result of denied) {
          expect(result.status).toBe(422);
          expect(result.body.error.code).toBe("INVALID_LIFECYCLE");
        }
        expect(await snapshot(store, older.id)).toEqual(beforeDenied);

        await reads(async () => {
          await listLinks(page, layout).getByText(older.title, { exact: true }).click();
          await management(page, older, "closed");
          await page.getByRole("button", { name: "Reopen poll…", exact: true }).click();
          const dialog = page.getByRole("dialog", { name: "Reopen this poll?", exact: true });
          await expect(dialog).toContainText("People with the link can change responses again.");
          await expect(dialog).toContainText("provisional");
          await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
          await expect(dialog).not.toBeVisible();
        });
        const reopened = await mutation(store, older, ["POLL_REOPENED"], "organiser", async () => {
          await page.getByRole("button", { name: "Reopen poll…", exact: true }).click();
          await page.getByRole("dialog", { name: "Reopen this poll?", exact: true })
            .getByRole("button", { name: "Reopen poll", exact: true }).click();
          await management(page, older, "open");
          await expect(page.getByRole("region", { name: "Provisional selection" })).toContainText("Saturday 10 October 2026");
        });
        expect(reopened.poll.selectedDateId).toBe(closed.poll.selectedDateId);
        expect(reopened.poll.provisional).toBe(true);
        await reads(async () => {
          await list(page, layout, runId, "closed", [], () => returnLink(page).click());
          await list(page, layout, runId, "active", [expected(newer, "draft"), expected(older, "open", 2)], filterClick(page, "Active"));
          await list(page, layout, runId, "open", [expected(older, "open", 2)], filterClick(page, "Open"));
          await publicLink(participant, publicUrl, older, "open");
          await expect(participant.getByRole("region", { name: "Provisional selection" })).toBeVisible();
        });
        await mutation(store, older, ["PARTICIPANT_ADDED"], "anonymous-link-holder", () => addParticipant(participant, "Charlie"));
        await mutation(store, older, ["AVAILABILITY_CHANGED"], "anonymous-link-holder", async () => {
          await participant.getByRole("button", { name: "Alice, Sat 17 Oct: No", exact: true }).click();
          await expect(participant.getByRole("button", { name: "Alice, Sat 17 Oct: Yes", exact: true })).toBeVisible();
        });
        await reads(async () => {
          await list(page, layout, runId, "active", [expected(newer, "draft"), expected(older, "open", 3)], filterClick(page, "Active"));
          await list(page, layout, runId, "open", [expected(older, "open", 3)], filterClick(page, "Open"));
          await list(page, layout, runId, "closed", [], filterClick(page, "Closed"));
        });
        expect(await snapshot(store, newer.id)).toEqual(newerBefore);
      } finally { await participantContext.close(); }
    });
  });
}
