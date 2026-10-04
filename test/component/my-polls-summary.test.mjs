import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { expect as playwrightExpect } from "@playwright/test";
import { startComponentBrowser } from "../support/frontend-component-harness.mjs";
import { createSummaryFixture, emptyPage, failedPage, savedChoices, summaryRecords, summaryTitles } from "../support/my-polls-component-fixture.mjs";

const expect = playwrightExpect.configure({ timeout: 1_500 });
let components;
before(async () => { components = await startComponentBrowser(); });
after(async () => { await components?.close(); });

test("desktop table and mobile cards expose the same five fields and lifecycle navigation", async (t) => {
  for (const [label, viewport] of [["desktop", { width: 1024, height: 800 }], ["mobile", { width: 390, height: 844 }]]) {
    const harness = await components.mount(t, { fixture: createSummaryFixture(), viewport });
    await harness.goto("/?testRunId=olivia");
    const visible = label === "desktop" ? ".my-polls-desktop" : ".my-polls-mobile";
    await expect(harness.page.getByRole("heading", { name: "My polls", exact: true })).toBeVisible();
    await expect(harness.page.getByRole("link", { name: "Create poll", exact: true })).toBeVisible();
    await expect(harness.page.locator(visible)).toBeVisible();
    if (label === "desktop") {
      await expect(harness.page.getByRole("table", { name: "Poll summaries" })).toBeVisible();
      assert.deepEqual(await harness.page.locator(`${visible} thead th`).allTextContents(),
        ["Title", "Status", "Created", "Proposed dates", "Participants"]);
      assert.equal(await harness.page.locator(`${visible} tbody th[scope=row]`).count(), 2);
    } else {
      assert.equal(await harness.page.locator(`${visible} article dl`).count(), 2);
      assert.deepEqual(await harness.page.locator(`${visible} article`).first().locator("dt").allTextContents(),
        ["Status", "Created", "Proposed dates", "Participants"]);
    }
    const draft = harness.page.locator(visible).getByRole("link", { name: summaryTitles.draft });
    const open = harness.page.locator(visible).getByRole("link", { name: summaryTitles.open });
    await expect(draft).toHaveAttribute("href", /pollId=draft-1&view=editor/);
    await expect(open).toHaveAttribute("href", /pollId=open-1&view=manage/);
    await expect(harness.page.locator(visible).getByText("No dates proposed", { exact: true })).toBeVisible();
    await expect(harness.page.locator(visible).getByText("0 participants", { exact: true })).toBeVisible();
    await expect(harness.page.locator(visible).getByText("2 participants", { exact: true })).toBeVisible();
    await expect(harness.page.locator(visible).getByText("4 Oct 2026", { exact: true })).toHaveCount(2);
    await expect(harness.page.locator(`${visible} .summary-status--draft`)).toHaveText("Draft");
    await expect(harness.page.locator(`${visible} .summary-status--open`)).toHaveText("Open");
    await draft.focus();
    await expect(draft).toBeFocused();
    await draft.press("Enter");
    await expect(harness.page).toHaveURL(/pollId=draft-1&view=editor/);
    await expect(harness.page.getByRole("heading", { name: summaryTitles.draft })).toBeVisible();
  }
});

test("saved date order, calendar days, time, zone and repeated-hour offsets survive viewer zones", async (t) => {
  for (const timezoneId of ["Europe/London", "America/Los_Angeles"]) {
    const harness = await components.mount(t, { fixture: createSummaryFixture(),
      viewport: { width: 390, height: 844 }, timezoneId });
    await harness.goto("/?testRunId=olivia");
    const open = harness.page.locator(".my-polls-mobile article").filter({ hasText: summaryTitles.open });
    const choices = await open.locator(".my-polls-dates li").allTextContents();
    assert.deepEqual(choices, [
      "Thu, 31 Dec 2026",
      "Sun, 25 Oct 2026, 01:30 · Europe/London · UTC+01:00",
      "Sun, 25 Oct 2026, 01:30 · Europe/London · UTC+00:00",
      "Sat, 2 Jan 2027"
    ]);
    await expect(open.getByText("4 Oct 2026", { exact: true })).toBeVisible();
    await harness.page.getByRole("button", { name: "Closed", exact: true }).click();
    const closed = harness.page.locator(".my-polls-mobile article");
    await expect(closed.locator(".summary-status--closed")).toHaveText("Closed");
    await expect(closed.locator(".my-polls-dates li")).toHaveText("Wed, 12 Aug 2026");
    await expect(closed.getByText("1 participant", { exact: true })).toBeVisible();
    await expect(closed.getByText("2 Aug 2026", { exact: true })).toBeVisible();
  }
});

test("320px and intermediate layouts contain long untrusted titles and all proposed choices", async (t) => {
  const records = [...summaryRecords(), {
    ...summaryRecords()[1], id: "long-1", title: summaryTitles.long,
    proposedDates: savedChoices, participants: []
  }];
  for (const width of [320, 640, 641, 760, 1024]) {
    const harness = await components.mount(t, { fixture: createSummaryFixture({ records }),
      viewport: { width, height: 844 } });
    await harness.goto("/?testRunId=olivia&filter=open");
    const visible = width <= 640 ? ".my-polls-mobile" : ".my-polls-desktop";
    await expect(harness.page.locator(visible).getByRole("link", { name: summaryTitles.long })).toBeVisible();
    assert.equal(await harness.page.locator(`${visible} .my-polls-dates li`).count(), 8);
    assert.equal(await harness.page.locator(`${visible} img`).count(), 0);
    assert.equal(await harness.page.evaluate(() => window.summaryInjected), undefined);
    assert.equal(await harness.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
      `page must not overflow at ${width}px`);
    if (width > 640) {
      const titleStyle = await harness.page.locator(`${visible} tbody th`).first().evaluate((cell) => {
        const style = getComputedStyle(cell);
        return { fontSize: Number.parseFloat(style.fontSize), transform: style.textTransform };
      });
      assert.ok(titleStyle.fontSize >= 14);
      assert.equal(titleStyle.transform, "none");
    }
  }
});

test("empty and failed list responses retain their distinct accessible messages", async (t) => {
  const emptyHarness = await components.mount(t, { fixture: createSummaryFixture({ replies: [emptyPage] }),
    viewport: { width: 390, height: 844 } });
  await emptyHarness.goto("/?testRunId=olivia");
  await expect(emptyHarness.page.getByRole("status")).toHaveText("No polls to show.");

  const failedHarness = await components.mount(t, { fixture: createSummaryFixture({ replies: [failedPage] }),
    viewport: { width: 390, height: 844 } });
  await failedHarness.goto("/?testRunId=olivia");
  await expect(failedHarness.page.getByRole("alert")).toContainText("Controlled failure");
});
