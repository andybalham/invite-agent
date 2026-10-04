import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { expect as playwrightExpect } from "@playwright/test";
import { startComponentBrowser } from "../support/frontend-component-harness.mjs";
import { createSummaryFixture, emptyPage, failedPage, heldResponse } from "../support/my-polls-component-fixture.mjs";

const expect = playwrightExpect.configure({ timeout: 1_500 });
const item = (id, title, status = "open", createdAt = "2026-10-04T08:00:00.000Z") => ({
  id, title, status, createdAt, timeZone: "Europe/London", proposedDates: [], participantCount: 0
});
const reply = (items, nextCursor) => ({ status: 200, body: { items, ...(nextCursor ? { nextCursor } : {}) } });
const query = ({ url }) => Object.fromEntries(new URL(url).searchParams);
const parameters = (filter = "active", search = "", cursor) => ({
  filter, search, pageSize: "25", ...(cursor ? { cursor } : {})
});
const searchField = (page) => page.getByRole("searchbox", { name: "Search poll titles", exact: true });
const filterButton = (page, name) => page.getByRole("group", { name: "Poll lifecycle" })
  .getByRole("button", { name, exact: true });
let components;
before(async () => { components = await startComponentBrowser(); });
after(async () => { await components?.close(); });

async function mountReadOnly(t, options = {}) {
  const fixture = options.fixture ?? createSummaryFixture();
  const snapshot = structuredClone([...fixture.records]);
  const harness = await components.mount(t, { ...options, fixture });
  t.after(() => {
    assert.deepEqual([...fixture.records], snapshot, "discovery preserves poll lifecycles and versions");
    assert.ok(fixture.requests.every(({ method, body }) => method === "GET" && body === undefined),
      "search/filter/page controls cannot send persisted lifecycle writes or audit-producing commands");
    assert.deepEqual(harness.organiserRequests(), harness.listRequests(), "discovery uses only the list endpoint");
    assert.ok(harness.listRequests().every(({ identity }) => identity === "local-organiser-olivia"));
  });
  return harness;
}

async function titles(page, expected) {
  // Both presentations consume the same server result set, including order.
  await expect(page.locator(".my-polls-desktop tbody a")).toHaveText(expected);
  await expect(page.locator(".my-polls-mobile h2 a")).toHaveText(expected);
}

test("Active defaults to Draft/Open; each lifecycle selection sends only list query parameters", async (t) => {
  const harness = await mountReadOnly(t);
  const { page } = harness;
  await harness.goto("/?testRunId=olivia");
  await titles(page, ["Unfinished autumn plan", "Repeated-hour supper"]);
  for (const [selected, expected] of [
    ["Active", ["Unfinished autumn plan", "Repeated-hour supper"]],
    ["Draft", ["Unfinished autumn plan"]], ["Open", ["Repeated-hour supper"]],
    ["Closed", ["Completed summer picnic"]], ["Active", ["Unfinished autumn plan", "Repeated-hour supper"]]
  ]) {
    if (selected !== "Active" || harness.listRequests().length > 1) await filterButton(page, selected).click();
    await titles(page, expected);
    for (const name of ["Active", "Draft", "Open", "Closed"]) {
      await expect(filterButton(page, name)).toHaveAttribute("aria-pressed", String(name === selected));
    }
  }
  assert.deepEqual(harness.listRequests().map(query), ["active", "draft", "open", "closed", "active"].map((filter) => parameters(filter)));
  assert.ok([...harness.fixture.records.values()].every(({ status }) => ["draft", "open", "closed"].includes(status)));
  await expect(searchField(page)).toHaveValue("");
});

for (const [layout, viewport] of [["desktop", { width: 1024, height: 800 }], ["mobile", { width: 390, height: 844 }]]) {
  test(`labelled controls precede the list and support keyboard no-match recovery on ${layout}`, async (t) => {
    const fixture = createSummaryFixture({ replies: [
      reply([item("draft", "Unfinished autumn plan", "draft"), item("open", "Repeated-hour supper")]),
      emptyPage, emptyPage, reply([item("closed", "Completed summer picnic", "closed")])
    ] });
    const harness = await mountReadOnly(t, { fixture, viewport: layout === "mobile" ? { width: 320, height: 844 } : viewport });
    const { page } = harness;
    await harness.goto("/?testRunId=olivia");
    await titles(page, ["Unfinished autumn plan", "Repeated-hour supper"]);
    const search = searchField(page);
    const lifecycle = page.getByRole("group", { name: "Poll lifecycle" });
    await expect(lifecycle.getByText("Poll lifecycle", { exact: true })).toBeVisible();
    await expect(search).toBeVisible();
    const list = page.locator(layout === "desktop" ? ".my-polls-desktop" : ".my-polls-mobile");
    const listBox = await list.boundingBox();
    for (const control of [search, lifecycle]) {
      const box = await control.boundingBox();
      assert.ok(box.y + box.height <= listBox.y, "query controls appear above the visible list");
    }
    for (const control of [search, ...["Active", "Draft", "Open", "Closed"].map((name) => filterButton(page, name))]) {
      const box = await control.boundingBox();
      assert.ok(box.height >= 44, "query controls provide usable touch targets");
      await expect(control).toHaveAttribute("aria-controls", "my-polls-results");
    }
    const active = filterButton(page, "Active");
    await active.hover();
    const colors = await active.evaluate((button) => {
      const style = getComputedStyle(button);
      return [style.backgroundColor, style.color];
    });
    assert.deepEqual(colors, ["rgb(32, 30, 29)", "rgb(243, 242, 242)"], "hover preserves selected contrast");
    await search.fill("Missing title");
    await expect(page.getByRole("status")).toHaveText("No polls match your search.");
    const closed = filterButton(page, "Closed");
    await closed.focus();
    await closed.press("Space");
    await expect(closed).toHaveAttribute("aria-pressed", "true");
    await expect(search).toHaveValue("Missing title");
    await expect(page.getByRole("status")).toHaveText("No polls match your search.");
    const clear = page.getByRole("button", { name: "Clear search", exact: true });
    await clear.focus();
    await clear.press("Enter");
    await titles(page, ["Completed summer picnic"]);
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("");
    await expect(clear).not.toBeVisible();
    assert.deepEqual(harness.listRequests().map(query), [parameters(), parameters("active", "Missing title"),
      parameters("closed", "Missing title"), parameters("closed")]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  });

  test(`search remains editable across every filter and clears within the selected filter on ${layout}`, async (t) => {
    const raw = "  Autumn & supper + friends  ";
    const fixture = createSummaryFixture({ replies: [emptyPage,
      reply([item("draft", raw, "draft"), item("open", raw)]),
      reply([item("draft", raw, "draft")]), reply([item("open", raw)]),
      reply([item("closed", raw, "closed")]), reply([item("other", "Other closed poll", "closed")])
    ] });
    const harness = await mountReadOnly(t, { fixture, viewport });
    const { page } = harness;
    await harness.goto("/?testRunId=olivia");
    await expect(page.getByRole("status")).toHaveText(/no.*active.*polls/i);
    await searchField(page).fill(raw);
    await titles(page, [raw.trim(), raw.trim()]);
    for (const selected of ["Draft", "Open", "Closed"]) {
      await filterButton(page, selected).click();
      await titles(page, [raw.trim()]);
      await expect(searchField(page)).toHaveValue(raw);
      assert.equal(new URL(page.url()).searchParams.get("search"), raw);
      assert.deepEqual(query(harness.listRequests().at(-1)), parameters(selected.toLowerCase(), raw));
    }
    const clear = page.getByRole("button", { name: "Clear search", exact: true });
    await expect(clear).toBeVisible();
    await clear.focus();
    await clear.press("Enter");
    await titles(page, ["Other closed poll"]);
    await expect(searchField(page)).toHaveValue("");
    await expect(filterButton(page, "Closed")).toHaveAttribute("aria-pressed", "true");
    assert.equal(new URL(page.url()).searchParams.has("search"), false);
    assert.deepEqual(harness.listRequests().map(query), [parameters(),
      ...["active", "draft", "open", "closed"].map((filter) => parameters(filter, raw)), parameters("closed")]);
  });
}

for (const [label, stale] of [["success", reply([item("stale", "Private stale Olivia")], "stale-cursor")], ["error", failedPage]]) {
  test(`identity A/B/A changes isolate pages from an earlier decoded ${label}`, async (t) => {
    const waiting = heldResponse(reply([item("sam", "Sam title")], "sam-cursor"));
    const fixture = createSummaryFixture({ replies: [stale, waiting,
      reply([item("fresh", "Current Olivia")], "fresh-cursor"), reply([item("last", "Olivia next page")])] });
    const harness = await components.mount(t, { fixture });
    const { page } = harness;
    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window);
      let listCount = 0;
      window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        const target = new URL(typeof args[0] === "string" ? args[0] : args[0].url, location.href);
        if (target.pathname === "/api/organiser/polls" && ++listCount === 1) {
          const originalJson = response.json.bind(response);
          response.json = () => new Promise((resolve, reject) => {
            window.releaseIdentityBody = () => originalJson().then(resolve, reject);
          });
        }
        return response;
      };
    });
    await harness.goto("/?testRunId=olivia&filter=open&search=title");
    await page.waitForFunction(() => typeof window.releaseIdentityBody === "function");
    await expect(page.locator(".my-polls-list")).toHaveAttribute("aria-busy", "true");
    await page.evaluate(() => {
      history.pushState({}, "", "/?testRunId=sam&filter=open&search=title");
      dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect.poll(() => harness.listRequests().length).toBe(2);
    await titles(page, []);
    await expect(page.getByRole("button", { name: "Load more polls" })).not.toBeVisible();
    waiting.release();
    await titles(page, ["Sam title"]);
    await page.evaluate(() => {
      history.pushState({}, "", "/?testRunId=olivia&filter=open&search=title");
      dispatchEvent(new PopStateEvent("popstate"));
    });
    await titles(page, ["Current Olivia"]);
    await page.evaluate(() => window.releaseIdentityBody());
    await titles(page, ["Current Olivia"]);
    await expect(page.locator(".my-polls-list")).toHaveAttribute("aria-busy", "false");
    await expect(page.getByRole("alert")).not.toBeVisible();
    await page.getByRole("button", { name: "Load more polls" }).click();
    await titles(page, ["Current Olivia", "Olivia next page"]);
    assert.deepEqual(harness.listRequests().map(({ identity }) => identity), [
      "local-organiser-olivia", "local-organiser-sam", "local-organiser-olivia", "local-organiser-olivia"
    ]);
    assert.deepEqual(harness.listRequests().map(query), [parameters("open", "title"), parameters("open", "title"),
      parameters("open", "title"), parameters("open", "title", "fresh-cursor")]);
    assert.ok(fixture.requests.every(({ method }) => method === "GET"));
  });
}

test("resolved title matching is supplied by the server; raw search and original titles survive transport", async (t) => {
  const match = item("cafe", "Café Autumn get-together");
  const other = item("other", "Winter dinner");
  // Explicit server answers for the approved exact/substring/NFC/case/Unicode
  // whitespace rules. Domain tests verify normalization; these client tests
  // prevent a second raw-string filter from discarding valid server matches.
  const cases = [
    [match.title, [match]], ["CAFÉ AUTUMN GET-TOGETHER", [match]],
    ["  CAFE\u0301\u0085\u2003 AUTUMN  ", [match]], ["get-together", [match]],
    ["cafe", []], ["get together", []], ["caf.*", []],
    ["description-only", []], ["Someone else's private title", []],
    ["\u0085\u2003", [match, other]], ["", [match, other]]
  ];
  const fixture = createSummaryFixture({ replies: [reply([match, other]), ...cases.map(([, items]) => reply(items))] });
  const harness = await mountReadOnly(t, { fixture });
  const { page } = harness;
  await harness.goto("/?testRunId=olivia&filter=open");
  await titles(page, [match.title, other.title]);
  for (const [raw, items] of cases) {
    await searchField(page).fill(raw);
    await expect.poll(() => query(harness.listRequests().at(-1))).toEqual(parameters("open", raw));
    await titles(page, items.map(({ title }) => title));
    await expect(searchField(page)).toHaveValue(raw);
    if (!items.length) await expect(page.getByRole("status")).toHaveText(/no.*polls.*match.*search/i);
  }
  assert.deepEqual(harness.listRequests().map(query), [parameters("open"), ...cases.map(([raw]) => parameters("open", raw))]);
});

test("terminal no-match permits editing, changing filters and clearing; Unicode blank search is an empty list", async (t) => {
  const fixture = createSummaryFixture({ replies: [emptyPage, reply([item("found", "Found title")]),
    emptyPage, emptyPage, reply([item("closed", "Closed without search", "closed")]), emptyPage] });
  const harness = await mountReadOnly(t, { fixture });
  const { page } = harness;
  await harness.goto("/?testRunId=olivia&filter=open&search=missing");
  await expect(searchField(page)).toHaveValue("missing");
  await expect(page.getByRole("status")).toHaveText(/no.*polls.*match.*search/i);
  await expect(page.getByRole("link", { name: "Create poll", exact: true })).toBeVisible();
  await searchField(page).fill("Found");
  await titles(page, ["Found title"]);
  await searchField(page).fill("missing again");
  await expect(page.getByRole("status")).toHaveText(/no.*polls.*match.*search/i);
  await filterButton(page, "Closed").click();
  await expect.poll(() => query(harness.listRequests().at(-1))).toEqual(parameters("closed", "missing again"));
  await expect(page.getByRole("button", { name: "Clear search" })).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await titles(page, ["Closed without search"]);
  await searchField(page).fill("\u0085\u2003");
  await expect(page.getByRole("status")).toHaveText(/no.*closed.*polls/i);
  assert.deepEqual(harness.listRequests().map(query), [parameters("open", "missing"), parameters("open", "Found"),
    parameters("open", "missing again"), parameters("closed", "missing again"), parameters("closed"), parameters("closed", "\u0085\u2003")]);
});

test("Load more preserves global server creation order and deduplicates live pages across sparse continuations", async (t) => {
  const newest = { ...item("newest", "Z newest", "draft", "2026-10-05T08:00:00.000Z"), updatedAt: "2026-10-05T08:00:00.000Z", version: 1 };
  const tieZ = item("z", "B equal instant");
  const tieA = item("a", "A equal instant");
  const old = { ...item("old", "C edited and reopened", "open", "2026-09-01T08:00:00.000Z"), updatedAt: "2026-10-06T08:00:00.000Z", version: 99 };
  const fixture = createSummaryFixture({ replies: [reply([newest], "first"), reply([tieZ, tieA], "second"),
    reply([], "third"), reply([tieA, old])] });
  const harness = await mountReadOnly(t, { fixture });
  const { page } = harness;
  await harness.goto("/?testRunId=olivia&search=instant");
  await titles(page, [newest.title]);
  const more = page.getByRole("button", { name: "Load more polls" });
  await more.click();
  await titles(page, [newest.title, tieZ.title, tieA.title]);
  await more.click();
  await expect(page.getByRole("status")).toHaveText(/more.*polls.*match/i);
  await expect(more).toBeVisible();
  await more.click();
  await titles(page, [newest.title, tieZ.title, tieA.title, old.title]);
  await expect(more).not.toBeVisible();
  assert.deepEqual(harness.listRequests().map(query), [undefined, "first", "second", "third"].map((cursor) => parameters("active", "instant", cursor)));
});

test("filter, search and clear changes discard every accumulated page and restart without the previous cursor", async (t) => {
  const closed = heldResponse(reply([item("closed", "Closed first", "closed")], "closed-more"));
  const fixture = createSummaryFixture({ replies: [reply([item("active-1", "Active first")], "active-more"),
    reply([item("active-2", "Active second")], "active-last"), closed,
    reply([item("closed-2", "Closed second", "closed")], "closed-last"),
    reply([item("search-1", "Search first", "closed")], "search-more"),
    reply([item("search-2", "Search second", "closed")], "search-last"),
    reply([item("reset", "Closed reset", "closed")], "reset-more"),
    reply([item("active-1", "Active first")])
  ] });
  const harness = await mountReadOnly(t, { fixture });
  const { page } = harness;
  await harness.goto("/?testRunId=olivia");
  await titles(page, ["Active first"]);
  const more = page.getByRole("button", { name: "Load more polls" });
  await more.click();
  await titles(page, ["Active first", "Active second"]);
  await filterButton(page, "Closed").click();
  await expect(page.getByRole("status")).toHaveText(/loading.*polls/i);
  await titles(page, []);
  await expect(more).not.toBeVisible();
  closed.release();
  await titles(page, ["Closed first"]);
  await more.click();
  await titles(page, ["Closed first", "Closed second"]);
  await searchField(page).fill("Search");
  await titles(page, ["Search first"]);
  await more.click();
  await titles(page, ["Search first", "Search second"]);
  await page.getByRole("button", { name: "Clear search" }).click();
  await titles(page, ["Closed reset"]);
  await filterButton(page, "Active").click();
  await titles(page, ["Active first"]);
  assert.deepEqual(harness.listRequests().map(query), [parameters(), parameters("active", "", "active-more"),
    parameters("closed"), parameters("closed", "", "closed-more"), parameters("closed", "Search"),
    parameters("closed", "Search", "search-more"), parameters("closed"), parameters()]);
});

for (const [label, stale] of [["success", reply([item("stale", "Stale decoded body")], "stale-cursor")], ["error", failedPage]]) {
  test(`rapid A/B/A queries ignore an earlier ${label} even when its response body finishes last`, async (t) => {
    const fixture = createSummaryFixture({ replies: [stale, reply([item("middle", "Middle query")], "middle-cursor"),
      reply([item("fresh", "Fresh query")], "fresh-cursor"), reply([item("last", "Fresh next page")])] });
    const harness = await mountReadOnly(t, { fixture });
    const { page } = harness;
    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window);
      let listCount = 0;
      window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        const target = new URL(typeof args[0] === "string" ? args[0] : args[0].url, location.href);
        if (target.pathname === "/api/organiser/polls" && ++listCount === 1) {
          const originalJson = response.json.bind(response);
          response.json = () => new Promise((resolve, reject) => {
            window.releaseFirstListBody = () => originalJson().then(resolve, reject);
          });
        }
        return response;
      };
    });
    await harness.goto("/?testRunId=olivia&filter=open&search=A");
    await page.waitForFunction(() => typeof window.releaseFirstListBody === "function");
    await searchField(page).fill("B");
    await titles(page, ["Middle query"]);
    await searchField(page).fill("A");
    await titles(page, ["Fresh query"]);
    await page.evaluate(() => window.releaseFirstListBody());
    await titles(page, ["Fresh query"]);
    await expect(page.getByRole("alert")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).not.toBeVisible();
    await page.getByRole("button", { name: "Load more polls" }).click();
    await titles(page, ["Fresh query", "Fresh next page"]);
    assert.deepEqual(harness.listRequests().map(query), [parameters("open", "A"), parameters("open", "B"),
      parameters("open", "A"), parameters("open", "A", "fresh-cursor")]);
  });
}
