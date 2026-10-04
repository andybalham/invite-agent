import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { expect as playwrightExpect } from "@playwright/test";
import { startComponentBrowser } from "../support/frontend-component-harness.mjs";
import { createSummaryFixture, emptyPage, failedPage, heldResponse } from "../support/my-polls-component-fixture.mjs";

const expect = playwrightExpect.configure({ timeout: 1_500 });
const item = (id, title, createdAt = "2026-10-04T08:00:00.000Z") => ({
  id, title, status: "draft", createdAt, timeZone: "Europe/London", proposedDates: [], participantCount: 0
});
const page = (items, nextCursor) => ({ status: 200, body: { items, ...(nextCursor ? { nextCursor } : {}) } });
let components;
before(async () => { components = await startComponentBrowser(); });
after(async () => { await components?.close(); });

test("pages append in server creation order, including an empty continuing page", async (t) => {
  const waiting = heldResponse(page([item("older", "Older")], "second"));
  const fixture = createSummaryFixture({ replies: [
    page([item("newest", "Newest", "2026-10-05T08:00:00.000Z")], "first"),
    waiting,
    page([], "third"),
    page([item("oldest", "Oldest", "2026-10-03T08:00:00.000Z")])
  ] });
  const harness = await components.mount(t, { fixture });
  await harness.goto("/?testRunId=olivia");
  await expect(harness.page.getByRole("link", { name: "Newest" })).toBeVisible();
  const more = harness.page.getByRole("button", { name: "Load more polls" });
  await more.click();
  await expect(harness.page.getByRole("status")).toHaveText(/loading.*more.*polls/i);
  await expect(more).not.toBeVisible();
  await harness.page.locator(".my-polls-more").evaluate((button) => button.click());
  assert.equal(harness.listRequests().length, 2, "a pending page cannot be requested twice");
  waiting.release();
  await expect(harness.page.getByRole("link", { name: "Older" })).toBeVisible();
  await more.click();
  await expect(harness.page.getByRole("status")).toHaveText(/more.*polls.*match/i);
  await expect(more).toBeVisible();
  await more.click();
  await expect(harness.page.getByRole("link", { name: "Oldest" })).toBeVisible();
  assert.deepEqual(await harness.page.locator(".my-polls-desktop tbody a").allTextContents(), ["Newest", "Older", "Oldest"]);
  assert.deepEqual(harness.listRequests().map(({ url }) => {
    const params = new URL(url).searchParams;
    return [params.get("pageSize"), params.get("cursor")];
  }), [["25", null], ["25", "first"], ["25", "second"], ["25", "third"]]);
  await expect(more).not.toBeVisible();
});

test("initial and append failures have separate retry paths and preserve the continuation", async (t) => {
  const fixture = createSummaryFixture({ replies: [failedPage, page([item("first", "First")], "cursor-one"), failedPage,
    page([item("second", "Second")])] });
  const harness = await components.mount(t, { fixture });
  await harness.goto("/?testRunId=olivia&filter=draft&search=First");
  const retry = harness.page.getByRole("button", { name: "Try again" });
  await expect(harness.page.getByRole("alert")).toHaveText(/could.*load.*polls/i);
  await expect(harness.page.getByRole("alert")).not.toContainText("Controlled failure");
  await expect(harness.page.getByRole("status")).toBeEmpty();
  await retry.click();
  await expect(harness.page.getByRole("link", { name: "First" })).toBeVisible();
  await harness.page.getByRole("button", { name: "Load more polls" }).click();
  await expect(harness.page.getByRole("alert")).toHaveText(/could.*load.*more.*polls/i);
  await expect(harness.page.getByRole("link", { name: "First" })).toBeVisible();
  await expect(harness.page.getByRole("button", { name: "Load more polls" })).not.toBeVisible();
  await retry.click();
  await expect(harness.page.getByRole("link", { name: "Second" })).toBeVisible();
  assert.deepEqual(harness.listRequests().map(({ url }) => new URL(url).searchParams.get("cursor")),
    [null, null, "cursor-one", "cursor-one"]);
  assert.ok(harness.listRequests().every(({ url }) => new URL(url).searchParams.get("search") === "First"));
});

test("restoring a cached dashboard discards accumulated pages and ignores a pending old continuation", async (t) => {
  const stale = heldResponse(page([item("stale", "Stale continuation")], "obsolete"));
  const fixture = createSummaryFixture({ replies: [
    page([item("first", "Before management")], "first-cursor"),
    page([item("second", "Old page two")], "second-cursor"), stale,
    page([item("fresh", "After management")], "fresh-cursor"),
    page([item("last", "Current page two")])
  ] });
  const harness = await components.mount(t, { fixture });
  await harness.goto("/?testRunId=olivia&filter=draft&search=dinner");
  const more = harness.page.getByRole("button", { name: "Load more polls" });
  await more.click();
  await expect(harness.page.getByRole("link", { name: "Old page two" })).toBeVisible();
  await more.click();
  await expect(harness.page.getByRole("status")).toHaveText(/loading.*more.*polls/i);
  await harness.page.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect(harness.page.getByRole("link", { name: "After management" })).toBeVisible();
  stale.release();
  await more.click();
  await expect(harness.page.getByRole("link", { name: "Current page two" })).toBeVisible();
  assert.deepEqual(await harness.page.locator(".my-polls-desktop tbody a").allTextContents(),
    ["After management", "Current page two"]);
  assert.deepEqual(harness.listRequests().map(({ url }) => new URL(url).searchParams.get("cursor")),
    [null, "first-cursor", "second-cursor", null, "fresh-cursor"]);
  assert.ok(harness.listRequests().every(({ url }) => {
    const query = new URL(url).searchParams;
    return query.get("filter") === "draft" && query.get("search") === "dinner";
  }));
});

test("terminal empty and no-match states differ; Clear search retains the filter", async (t) => {
  const fixture = createSummaryFixture({ replies: [page([], "keep-looking"), emptyPage, emptyPage] });
  const harness = await components.mount(t, { fixture });
  await harness.goto("/?testRunId=olivia&filter=closed&search=missing");
  await expect(harness.page.getByRole("status")).toHaveText(/more.*polls.*match/i);
  await expect(harness.page.getByRole("button", { name: "Clear search" })).toBeVisible();
  await harness.page.getByRole("button", { name: "Load more polls" }).click();
  await expect(harness.page.getByRole("status")).toHaveText(/no.*polls.*match.*search/i);
  await harness.page.getByRole("button", { name: "Clear search" }).click();
  await expect(harness.page.getByRole("status")).toHaveText(/no.*closed.*polls/i);
  assert.deepEqual(harness.listRequests().map(({ url }) => [
    new URL(url).searchParams.get("filter"), new URL(url).searchParams.get("search")
  ]), [["closed", "missing"], ["closed", "missing"], ["closed", ""]]);
});

test("query and URL identity changes clear entries and ignore delayed pages", async (t) => {
  const oldPage = heldResponse(page([item("old", "Stale Olivia")], "old-cursor"));
  const oldError = heldResponse(failedPage);
  const fixture = createSummaryFixture({ replies: [
    page([item("current", "Olivia current")], "cursor"), oldPage,
    page([item("closed", "Closed result")]), oldError,
    page([item("sam", "Sam result")])
  ] });
  const harness = await components.mount(t, { fixture });
  await harness.goto("/?testRunId=olivia");
  await expect(harness.page.getByRole("link", { name: "Olivia current" })).toBeVisible();
  await harness.page.getByRole("button", { name: "Load more polls" }).click();
  await expect(harness.page.getByRole("status")).toHaveText(/loading.*more.*polls/i);
  await harness.page.getByRole("button", { name: "Closed", exact: true }).click();
  await expect(harness.page.getByRole("link", { name: "Closed result" })).toBeVisible();
  oldPage.release();
  await expect(harness.page.getByRole("link", { name: "Stale Olivia" })).not.toBeVisible();
  await harness.page.evaluate(() => {
    history.pushState({}, "", "/?testRunId=olivia&filter=draft");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(harness.page.getByRole("status")).toHaveText(/loading.*polls/i);
  await harness.page.evaluate(() => {
    history.pushState({}, "", "/?testRunId=sam");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(harness.page.getByRole("link", { name: "Sam result" })).toBeVisible();
  await expect(harness.page.getByRole("link", { name: "Sam result" })).toHaveAttribute("href", /testRunId=sam/);
  oldError.release();
  await expect(harness.page.getByRole("alert")).not.toBeVisible();
  await expect(harness.page.getByRole("link", { name: "Closed result" })).not.toBeVisible();
  assert.deepEqual(harness.listRequests().map(({ identity }) => identity), [
    "local-organiser-olivia", "local-organiser-olivia", "local-organiser-olivia",
    "local-organiser-olivia", "local-organiser-sam"
  ]);
});

test("authentication failure clears loaded summaries and continuation", async (t) => {
  const fixture = createSummaryFixture({ replies: [page([item("private", "Private result")], "more"),
    { status: 401, body: { error: { code: "UNAUTHENTICATED", message: "Authentication required" } } }] });
  const harness = await components.mount(t, { fixture });
  await harness.goto("/?testRunId=olivia");
  await expect(harness.page.getByRole("link", { name: "Private result" })).toBeVisible();
  await harness.page.getByRole("button", { name: "Load more polls" }).click();
  await expect(harness.page.getByRole("alert")).toHaveText(/sign in.*polls/i);
  await expect(harness.page.getByRole("link", { name: "Private result" })).not.toBeVisible();
  await expect(harness.page.getByRole("button", { name: "Load more polls" })).not.toBeVisible();
  await expect(harness.page.getByRole("button", { name: "Try again" })).not.toBeVisible();
});

test("a stale success or error body cannot replace the new query", async (t) => {
  for (const stale of [page([item("stale", "Stale result")]), failedPage]) {
    const fixture = createSummaryFixture({ replies: [stale, page([item("fresh", "Fresh result")])] });
    const harness = await components.mount(t, { fixture });
    await harness.page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        const target = new URL(typeof args[0] === "string" ? args[0] : args[0].url, location.href);
        if (target.pathname === "/api/organiser/polls" && target.searchParams.get("filter") === "active") {
          const originalJson = response.json.bind(response);
          response.json = () => new Promise((resolve, reject) => {
            window.releaseListBody = () => originalJson().then(resolve, reject);
          });
        }
        return response;
      };
    });
    await harness.goto("/?testRunId=olivia");
    await harness.page.waitForFunction(() => typeof window.releaseListBody === "function");
    await harness.page.getByRole("button", { name: "Draft", exact: true }).click();
    await expect(harness.page.getByRole("link", { name: "Fresh result" })).toBeVisible();
    await harness.page.evaluate(() => window.releaseListBody());
    await expect(harness.page.getByRole("link", { name: "Stale result" })).not.toBeVisible();
    await expect(harness.page.getByRole("alert")).not.toBeVisible();
    await expect(harness.page.getByRole("link", { name: "Fresh result" })).toBeVisible();
  }
});
