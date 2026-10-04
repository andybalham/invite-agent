import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { expect as playwrightExpect } from "@playwright/test";
import { startComponentBrowser } from "../support/frontend-component-harness.mjs";
import { createLifecycleFixture } from "../support/my-polls-lifecycle-fixture.mjs";
import { navigationOwners } from "../support/organiser-navigation-fixture.mjs";

const expect = playwrightExpect.configure({ timeout: 1_500 });
let components;
before(async () => { components = await startComponentBrowser(); });
after(async () => { await components?.close(); });

async function titles(page, expected) {
  await expect(page.locator(".my-polls-desktop tbody a")).toHaveText(expected);
  await expect(page.locator(".my-polls-mobile h2 a")).toHaveText(expected);
}

function snapshot(fixture) {
  return structuredClone({ records: [...fixture.records], writes: fixture.writes });
}

async function returnToList(harness, filter, search = "") {
  const previous = harness.listRequests().length;
  const before = snapshot(harness.fixture);
  await harness.page.getByRole("link", { name: /^(?:←\s*)?My polls$/ }).click();
  await expect(harness.page.getByRole("heading", { name: "My polls", exact: true })).toBeVisible();
  await expect(harness.page.locator(".my-polls-list")).toHaveAttribute("aria-busy", "false");
  assert.equal(harness.listRequests().length, previous + 1, "return performs one new list read");
  const query = new URL(harness.listRequests().at(-1).url).searchParams;
  assert.equal(query.get("filter"), filter);
  assert.equal(query.get("search"), search);
  assert.equal(query.has("cursor"), false, "return invalidates accumulated pages and starts at page one");
  assert.deepEqual(snapshot(harness.fixture), before, "refresh itself adds no writes, versions or audit events");
}

async function summary(page, title, status, creation, count, dates) {
  for (const selector of [".my-polls-desktop tbody tr", ".my-polls-mobile article"]) {
    const row = page.locator(selector).filter({ hasText: title });
    await expect(row.locator(`.summary-status--${status.toLowerCase()}`)).toHaveText(status);
    await expect(row.getByText(creation, { exact: true })).toHaveCount(1);
    await expect(row.getByText(`${count} ${count === 1 ? "participant" : "participants"}`, { exact: true })).toHaveCount(1);
    if (dates) await expect(row.locator(".my-polls-dates li")).toHaveText(dates);
  }
}

async function mount(t, options = {}) {
  return components.mount(t, { fixture: createLifecycleFixture(), ...options });
}

test("T-120 new draft creation/edit returns to fresh default Active with saved dates and zero participants", async (t) => {
  const harness = await mount(t);
  const { page, fixture } = harness;
  await harness.goto("/?testRunId=olivia&filter=closed&search=closed");
  await page.getByRole("link", { name: "Create poll", exact: true }).click();
  await page.getByLabel(/^Title(?:\s*\*)?$/).fill("New saved dinner");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByTestId("draft-form").getByRole("status")).toHaveText("Draft saved.");
  const created = fixture.writes[0].poll;
  const creation = created.createdAt;
  await page.locator("#new-date").fill("2026-11-11");
  await page.locator("#new-time").fill("");
  await page.getByRole("button", { name: "Add date", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByTestId("draft-form").getByRole("status")).toHaveText("Changes saved.");
  assert.equal(fixture.records.get(created.id).createdAt, creation);
  assert.equal(harness.listRequests().length, 1, "draft writes refresh on return, not while in the editor");
  await returnToList(harness, "active");
  await titles(page, ["New saved dinner", "Olivia open dinner", "Olivia draft dinner"]);
  const createdLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" })
    .format(new Date(creation));
  await summary(page, "New saved dinner", "Draft", createdLabel, 0, ["Wed, 11 Nov 2026"]);
  assert.deepEqual(fixture.writes.map(({ audit }) => audit.action), ["POLL_CREATED", "POLL_DETAILS_UPDATED"]);
});

test("T-120 editing an older draft refreshes saved title/dates without promoting creation order", async (t) => {
  const harness = await mount(t);
  const { page, fixture } = harness;
  await harness.goto("/?testRunId=olivia&search=dinner");
  await titles(page, ["Olivia open dinner", "Olivia draft dinner"]);
  await page.getByRole("link", { name: "Olivia draft dinner", exact: true }).click();
  await page.getByLabel(/^Title(?:\s*\*)?$/).fill("Edited older dinner");
  await page.locator(".choice-date").first().fill("2026-11-11");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByTestId("draft-form").getByRole("status")).toHaveText("Changes saved.");
  await returnToList(harness, "active", "dinner");
  await titles(page, ["Olivia open dinner", "Edited older dinner"]);
  await summary(page, "Edited older dinner", "Draft", "1 Sept 2026", 0, ["Wed, 11 Nov 2026", "Tue, 13 Oct 2026"]);
  assert.equal(fixture.records.get("draft-1").createdAt, "2026-09-01T08:00:00.000Z");
  assert.equal(fixture.writes.length, 1);
});

test("T-120 saved title changes reconcile retained search membership on return", async (t) => {
  const harness = await mount(t);
  const { page } = harness;
  await harness.goto("/?testRunId=olivia&filter=draft&search=dinner");
  await page.getByRole("link", { name: "Olivia draft dinner", exact: true }).click();
  await page.getByLabel(/^Title(?:\s*\*)?$/).fill("Older picnic");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByTestId("draft-form").getByRole("status")).toHaveText("Changes saved.");
  await returnToList(harness, "draft", "dinner");
  await titles(page, []);
  await expect(page.locator(".my-polls-status")).toHaveText("No polls match your search.");
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await titles(page, ["Older picnic"]);
});

for (const filter of ["active", "draft"]) {
  test(`T-120 publication stays on management with share link and reconciles ${filter} on return`, async (t) => {
    const harness = await mount(t);
    const { page, fixture } = harness;
    await harness.goto(`/?testRunId=olivia&filter=${filter}&search=dinner`);
    await page.getByRole("link", { name: "Olivia draft dinner", exact: true }).click();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("region", { name: "Organiser controls" })).toBeVisible();
    await expect(page.getByTestId("public-state")).toHaveText("Open");
    await expect(page).toHaveURL(/view=manage/);
    await expect(page.getByRole("heading", { name: "My polls", exact: true })).not.toBeVisible();
    await expect(page.getByLabel("Public poll link", { exact: true })).toHaveValue(fixture.publicUrl("draft-1"));
    assert.equal(harness.listRequests().length, 1, "publication does not navigate to or prefetch the dashboard");
    fixture.setParticipants("draft-1", ["Ada", "Grace"]);
    await returnToList(harness, filter, "dinner");
    await titles(page, filter === "active" ? ["Olivia open dinner", "Olivia draft dinner"] : []);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await titles(page, ["Olivia open dinner", "Olivia draft dinner"]);
    await summary(page, "Olivia draft dinner", "Open", "1 Sept 2026", 2);
    assert.deepEqual(fixture.writes.map(({ audit }) => audit.action), ["POLL_DETAILS_UPDATED", "POLL_PUBLISHED"]);
  });
}

for (const filter of ["active", "open"]) {
  test(`T-120 confirmed close reconciles ${filter}/Closed and retains counts, dates and creation position`, async (t) => {
    const harness = await mount(t);
    const { page, fixture } = harness;
    fixture.setParticipants("open-1", ["Ada", "Grace"]);
    await harness.goto(`/?testRunId=olivia&filter=${filter}&search=dinner`);
    await page.getByRole("link", { name: "Olivia open dinner", exact: true }).click();
    await page.locator("button[data-close-choice-id]").first().click();
    const dialog = page.getByRole("dialog", { name: "Final date", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Yes · 2");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(fixture.writes.length, 0, "cancelled preview is read-only");
    await page.locator("button[data-close-choice-id]").first().click();
    await dialog.getByRole("button", { name: "Confirm & close poll", exact: true }).click();
    await expect(page.getByTestId("public-state")).toHaveText("Closed");
    assert.equal(harness.listRequests().length, 1);
    await returnToList(harness, filter, "dinner");
    await titles(page, filter === "active" ? ["Olivia draft dinner"] : []);
    await page.getByRole("button", { name: "Closed", exact: true }).click();
    await titles(page, ["Olivia closed dinner", "Olivia open dinner"]);
    await summary(page, "Olivia open dinner", "Closed", "2 Sept 2026", 2, ["Mon, 12 Oct 2026", "Tue, 13 Oct 2026"]);
    assert.deepEqual(fixture.writes.map(({ audit }) => audit.action), ["POLL_CLOSED"]);
    const command = fixture.requests.find(({ url, method }) => method === "POST" && new URL(url).pathname.endsWith("/close"));
    assert.deepEqual(command.body, { selectedDateId: "open-1-date-1", confirmed: true });
  });
}

test("T-120 confirmed reopen reconciles Closed/Active/Open with provisional selection and original creation order", async (t) => {
  const harness = await mount(t, { viewport: { width: 390, height: 844 } });
  const { page, fixture } = harness;
  fixture.records.get("closed-1").createdAt = "2026-08-01T08:00:00.000Z";
  await harness.goto("/?testRunId=olivia&filter=closed&search=dinner");
  await page.getByRole("link", { name: "Olivia closed dinner", exact: true }).click();
  await page.getByRole("button", { name: "Reopen poll…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Reopen this poll?" });
  await expect(dialog).toContainText("provisional");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(fixture.writes.length, 0);
  await page.getByRole("button", { name: "Reopen poll…", exact: true }).click();
  await dialog.getByRole("button", { name: "Reopen poll", exact: true }).click();
  await expect(page.getByTestId("public-state")).toHaveText("Open");
  await expect(page.locator(".provisional-selection")).toContainText("Provisional");
  const poll = fixture.records.get("closed-1");
  assert.equal(poll.selectedDateId, "closed-1-date-1");
  assert.equal(poll.provisional, true);
  fixture.setParticipants("closed-1", ["Ada"]);
  await returnToList(harness, "closed", "dinner");
  await titles(page, []);
  for (const [filter, expected] of [["Active", ["Olivia open dinner", "Olivia draft dinner", "Olivia closed dinner"]],
    ["Open", ["Olivia open dinner", "Olivia closed dinner"]]]) {
    await page.getByRole("button", { name: filter, exact: true }).click();
    await titles(page, expected);
    await summary(page, "Olivia closed dinner", "Open", "1 Aug 2026", 1);
  }
  assert.deepEqual(fixture.writes.map(({ audit }) => audit.action), ["POLL_REOPENED"]);
  const command = fixture.requests.find(({ url, method }) => method === "POST" && new URL(url).pathname.endsWith("/reopen"));
  assert.deepEqual(command.body, { confirmed: true });
});

test("T-120 read-only management return reads current external participant counts without lifecycle writes", async (t) => {
  const harness = await mount(t);
  const { page, fixture } = harness;
  await harness.goto("/?testRunId=olivia&filter=open&search=dinner");
  await summary(page, "Olivia open dinner", "Open", "2 Sept 2026", 0);
  fixture.setParticipants("open-1", ["Ada", "Grace"]);
  await page.getByRole("link", { name: "Olivia open dinner", exact: true }).click();
  await expect(page.getByRole("rowheader", { name: "Ada", exact: true })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "Grace", exact: true })).toBeVisible();
  fixture.setParticipants("open-1", ["Grace"]);
  await returnToList(harness, "open", "dinner");
  await summary(page, "Olivia open dinner", "Open", "2 Sept 2026", 1);
  assert.deepEqual(fixture.writes, []);
  assert.ok(fixture.requests.every(({ method }) => method === "GET"), "opening/returning reads do not issue lifecycle commands");
  // Exercise the existing refresh timer/focus hooks without imposing dashboard subscriptions.
  await page.clock.install();
  const count = harness.listRequests().length;
  const before = snapshot(fixture);
  await page.clock.fastForward(3_000);
  await page.evaluate(() => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
  assert.equal(harness.listRequests().length, count, "dashboard has no periodic/focus subscription");
  assert.deepEqual(snapshot(fixture), before);
});

test("T-120 returning after editing a page-two draft discards old pages/cursor and reloads current page one", async (t) => {
  const fixture = createLifecycleFixture();
  for (let index = 0; index < 25; index += 1) {
    const id = `newer-${String(index).padStart(2, "0")}`;
    fixture.records.set(id, { ...structuredClone(fixture.records.get("draft-1")), id,
      title: `Newer dinner ${index}`, createdAt: "2026-10-01T08:00:00.000Z" });
  }
  const harness = await mount(t, { fixture });
  const { page } = harness;
  await harness.goto("/?testRunId=olivia&filter=draft&search=dinner");
  await expect(page.locator(".my-polls-desktop tbody tr")).toHaveCount(25);
  await page.getByRole("button", { name: "Load more polls", exact: true }).click();
  await expect(page.locator(".my-polls-desktop tbody tr")).toHaveCount(26);
  assert.ok(new URL(harness.listRequests().at(-1).url).searchParams.has("cursor"));
  await page.getByRole("link", { name: "Olivia draft dinner", exact: true }).click();
  await page.getByLabel(/^Title(?:\s*\*)?$/).fill("Edited page two dinner");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByTestId("draft-form").getByRole("status")).toHaveText("Changes saved.");
  await returnToList(harness, "draft", "dinner");
  await expect(page.locator(".my-polls-desktop tbody tr")).toHaveCount(25);
  await expect(page.getByRole("link", { name: "Edited page two dinner", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Load more polls", exact: true }).click();
  await expect(page.locator(".my-polls-desktop tbody a").last()).toHaveText("Edited page two dinner");
  await summary(page, "Edited page two dinner", "Draft", "1 Sept 2026", 0);
  assert.equal(fixture.writes.length, 1);
});

for (const [command, id, filter, expected] of [
  ["update", "draft-1", "draft", ["Cached dinner edited"]],
  ["publish", "draft-1", "draft", []],
  ["close", "open-1", "open", []],
  ["reopen", "closed-1", "closed", []]
]) {
  test(`T-121 restored dashboard refetches ${command} results with retained filter/search`, async (t) => {
    const harness = await mount(t);
    const { page, fixture } = harness;
    const originalCreation = fixture.records.get(id).createdAt;
    await harness.goto(`/?testRunId=olivia&filter=${filter}&search=dinner`);
    await titles(page, [fixture.records.get(id).title]);
    const initialReads = harness.listRequests().length;
    // Routing disables browser caching in this harness. Reproduce the browser's
    // restore event after the real service changes the saved poll while away.
    const input = command === "update" ? { title: "Cached dinner edited", timeZone: "Europe/London",
      proposedDates: [{ kind: "date", localDate: "2026-11-11" }] }
      : command === "close" ? { confirmed: true, selectedDateId: `${id}-date-1` } : { confirmed: true };
    if (command === "publish") await fixture.service.publish(id, navigationOwners.olivia);
    else await fixture.service[command](id, input, navigationOwners.olivia);
    fixture.setParticipants(id, ["Ada", "Grace"]);
    const before = snapshot(fixture);
    await page.evaluate(() => {
      dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect.poll(() => harness.listRequests().length).toBe(initialReads + 1);
    await expect(page.locator(".my-polls-list")).toHaveAttribute("aria-busy", "false");
    await titles(page, expected);
    const query = new URL(harness.listRequests().at(-1).url).searchParams;
    assert.equal(query.get("filter"), filter);
    assert.equal(query.get("search"), "dinner");
    assert.equal(query.has("cursor"), false);
    assert.equal(fixture.records.get(id).createdAt, originalCreation);
    assert.deepEqual(snapshot(fixture), before, "restoring the dashboard adds no lifecycle writes");
    if (command === "update") await summary(page, expected[0], "Draft", "1 Sept 2026", 2, ["Wed, 11 Nov 2026"]);
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false })));
    assert.equal(harness.listRequests().length, initialReads + 1, "normal pageshow does not duplicate startup loading");
  });
}

test("T-121 restoring a management page does not load dashboard summaries", async (t) => {
  const harness = await mount(t);
  const { page } = harness;
  await harness.goto("/?pollId=open-1&view=manage&testRunId=olivia");
  await expect(page.getByRole("region", { name: "Organiser controls" })).toBeVisible();
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  assert.equal(harness.listRequests().length, 0);
});
