import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { expect as playwrightExpect } from "@playwright/test";
import { startComponentBrowser } from "../support/frontend-component-harness.mjs";
import { createSummaryFixture, summaryTitles } from "../support/my-polls-component-fixture.mjs";

const expect = playwrightExpect.configure({ timeout: 1_500 });
let components;
before(async () => { components = await startComponentBrowser(); });
after(async () => { await components?.close(); });

for (const [label, viewport, presentation] of [
  ["desktop", { width: 1024, height: 800 }, ".my-polls-desktop"],
  ["mobile", { width: 390, height: 844 }, ".my-polls-mobile"]
]) {
  test(`renders the owned Active dashboard and navigates titles with keyboard on ${label}`, async (t) => {
    const harness = await components.mount(t, { fixture: createSummaryFixture(), viewport, timezoneId: "Europe/London" });
    const { page } = harness;
    await harness.goto("/?testRunId=olivia");

    await expect(page.getByRole("heading", { name: "My polls", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create poll", exact: true })).toBeVisible();
    await expect(page.locator(presentation)).toBeVisible();
    await expect(page.locator(presentation).getByRole("link", { name: summaryTitles.draft, exact: true })).toBeVisible();
    await expect(page.locator(presentation).getByRole("link", { name: summaryTitles.open, exact: true })).toBeVisible();
    await expect(page.locator(presentation).getByText("Draft", { exact: true })).toBeVisible();
    await expect(page.locator(presentation).getByText("Open", { exact: true })).toBeVisible();
    await expect(page.locator(presentation).getByText("4 Oct 2026", { exact: true }).first()).toBeVisible();
    await expect(page.locator(presentation).getByText("0 participants", { exact: true })).toBeVisible();
    await expect(page.locator(presentation).getByText("2 participants", { exact: true })).toBeVisible();
    await expect(page.locator(presentation).getByText("4 proposed dates", { exact: true })).toBeVisible();
    await expect(page.locator(".my-polls-loaded")).toHaveText("2 polls loaded");
    await expect(page.locator(presentation).getByRole("link", { name: "Open poll", exact: true })).toHaveCount(2);
    for (const title of [summaryTitles.draft, summaryTitles.open]) {
      const summary = page.locator(`${presentation} ${label === "desktop" ? "tbody tr" : "article"}`)
        .filter({ has: page.getByRole("link", { name: title, exact: true }) });
      const action = summary.getByRole("link", { name: "Open poll", exact: true });
      await expect(action).toBeVisible();
      await expect(action).toHaveAttribute("href", await summary.getByRole("link", { name: title, exact: true }).getAttribute("href"));
    }
    await expect(page.locator(`${presentation} .my-polls-date-summary > .my-polls-dates`)
      .getByText("Thu, 31 Dec 2026", { exact: true })).toBeVisible();
    await expect(page.locator(presentation).getByText("Sat, 2 Jan 2027", { exact: true })).not.toBeVisible();
    await expect(page.getByRole("link", { name: /Sam private planning/ })).not.toBeVisible();

    const draft = page.locator(presentation).getByRole("link", { name: summaryTitles.draft, exact: true });
    await draft.focus();
    await expect(draft).toBeFocused();
    await draft.press("Enter");
    await expect(page).toHaveURL(/pollId=draft-1&view=editor/);
    await expect(page.getByRole("heading", { name: summaryTitles.draft })).toBeVisible();
    await expect(page.getByRole("link", { name: /My polls/ }).first()).toBeVisible();
  });
}

test("dashboard result boundaries and narrow layout remain explicit without page overflow", async (t) => {
  const harness = await components.mount(t, { fixture: createSummaryFixture(), viewport: { width: 320, height: 844 } });
  await harness.goto("/?testRunId=olivia");
  const results = harness.page.locator("#my-polls-results");
  await expect(results).toHaveAttribute("aria-label", "Owned polls");
  await expect(results.locator(".my-polls-card")).toHaveCount(2);
  await expect(harness.page.locator(".my-polls-loaded")).toHaveText("2 polls loaded");
  assert.equal(await harness.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
});

test("renders the controlled Closed summary without asserting a future filter journey", async (t) => {
  const harness = await components.mount(t, { fixture: createSummaryFixture(), viewport: { width: 390, height: 844 } });
  await harness.goto("/?testRunId=olivia&filter=closed");
  const closed = harness.page.locator(".my-polls-mobile");
  await expect(closed.getByRole("link", { name: summaryTitles.closed })).toBeVisible();
  await expect(closed.getByText("Closed", { exact: true })).toBeVisible();
  await expect(closed.getByText("1 participant", { exact: true })).toBeVisible();
  assert.equal(await harness.page.getByRole("link", { name: /Sam private planning/ }).count(), 0);
});
