import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { expect as playwrightExpect } from "@playwright/test";
import { startComponentBrowser } from "../support/frontend-component-harness.mjs";
import { compactFixture, compactSummary, dateLabels, datePreviewLimit, inlineDateLimit } from "../support/compact-date-fixture.mjs";

const expect = playwrightExpect.configure({ timeout: 1_500 });
let components;
before(async () => { components = await startComponentBrowser(); });
after(async () => { await components?.close(); });

const layouts = [
  { name: "desktop table", selector: ".my-polls-desktop tbody tr", viewport: { width: 1024, height: 800 } },
  { name: "mobile card", selector: ".my-polls-mobile article", viewport: { width: 390, height: 844 } }
];

async function mount(t, layout, summaries, timezoneId = "Europe/London") {
  const harness = await components.mount(t, { fixture: compactFixture(summaries), viewport: layout.viewport, timezoneId });
  await harness.goto(`/?testRunId=olivia&filter=${summaries[0].status}`);
  const entry = harness.page.locator(layout.selector).filter({ hasText: summaries[0].title });
  await expect(entry.getByRole("link", { name: summaries[0].title, exact: true })).toBeVisible();
  const before = structuredClone(summaries);
  t.after(() => {
    assert.deepEqual(summaries, before);
    assert.equal(harness.listRequests().length, 1, "disclosure does not refetch summaries");
    assert.ok(harness.organiserRequests().every(({ method, url }) =>
      method === "GET" && new URL(url).pathname === "/api/organiser/polls"),
    "date disclosure is a local read, without detail/share requests or mutations");
  });
  return { ...harness, entry };
}

async function controlledContent(page, button) {
  const id = await button.getAttribute("aria-controls");
  assert.ok(id && !/\s/.test(id), "aria-controls names one content element");
  const content = page.locator(`[id=${JSON.stringify(id)}]`);
  await expect(content).toHaveCount(1); // Includes the CSS-hidden alternative layout.
  return content;
}

async function labels(content, expected) {
  await expect(content.getByRole("listitem")).toHaveText(expected);
  for (const item of await content.getByRole("listitem").all()) await expect(item).toBeVisible();
}

for (const layout of layouts) {
  test(`T-153 ${layout.name}: zero dates has explicit copy and no disclosure`, async (t) => {
    const { entry } = await mount(t, layout, [compactSummary(0)]);
    await expect(entry.getByText("No dates proposed", { exact: true })).toBeVisible();
    await expect(entry.getByText("0 proposed dates", { exact: true })).toBeVisible();
    await expect(entry.getByRole("listitem")).toHaveCount(0);
    await expect(entry.getByRole("button", { name: /dates/i })).toHaveCount(0);
  });

  for (const count of [1, datePreviewLimit]) {
    test(`T-153 ${layout.name}: ${count} preview dates are complete without a redundant control`, async (t) => {
      const { entry } = await mount(t, layout, [compactSummary(count)]);
      await expect(entry.getByText(`${count} proposed ${count === 1 ? "date" : "dates"}`, { exact: true })).toBeVisible();
      await labels(entry, dateLabels.slice(0, count));
      await expect(entry.getByRole("button", { name: /dates/i })).toHaveCount(0);
    });
  }

  for (const count of [datePreviewLimit + 1, inlineDateLimit, inlineDateLimit + 1, 20]) {
    test(`T-153 ${layout.name}: ${count} dates collapse to a count and first three saved choices`, async (t) => {
      const { page, entry } = await mount(t, layout, [compactSummary(count, { status: "open" })]);
      // Test bounded visibility independently of whether hidden full lists are prebuilt.
      await labels(entry, dateLabels.slice(0, datePreviewLimit));
      await expect(entry.getByText(`${count} proposed dates`, { exact: true })).toBeVisible();
      const show = entry.getByRole("button", { name: "Show dates", exact: true });
      await expect(show).toHaveAttribute("aria-expanded", "false");
      const content = await controlledContent(page, show);
      await expect(content).toBeHidden();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });
  }

  for (const key of ["Enter", "Space"]) {
    test(`T-153 ${layout.name}: ${key} toggles the small-set region and restores compact output`, async (t) => {
      const count = inlineDateLimit;
      const { page, entry } = await mount(t, layout, [compactSummary(count)]);
      const show = entry.getByRole("button", { name: "Show dates", exact: true });
      await expect(show).toBeVisible();
      const content = await controlledContent(page, show);
      await expect(content).toBeHidden();
      await show.focus();
      await show.press(key);
      const hide = entry.getByRole("button", { name: "Hide dates", exact: true });
      await expect(hide).toHaveAttribute("aria-expanded", "true");
      await expect(hide).toHaveAttribute("aria-controls", await content.getAttribute("id"));
      await expect(hide).toBeFocused();
      await expect(content).toHaveAttribute("role", "region");
      await expect(content).toHaveAccessibleName(/dates/i);
      await labels(content, dateLabels.slice(0, count));
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await hide.press(key);
      await expect(content).toBeHidden();
      await expect(show).toHaveAttribute("aria-expanded", "false");
      await expect(show).toBeFocused();
      await labels(entry, dateLabels.slice(0, datePreviewLimit));
    });
  }

  for (const [count, activation, dismissal] of [[9, "Enter", "Escape"], [20, "click", "close"], [20, "Enter", "Escape"], [20, "Space", "close"]]) {
    test(`T-153 ${layout.name}: ${count}-date dialog ${activation}/${dismissal} has full content and focus restoration`, async (t) => {
      const summary = compactSummary(count, { status: "open" });
      const { page, entry } = await mount(t, layout, [summary]);
      const show = entry.getByRole("button", { name: "Show dates", exact: true });
      await expect(show).toBeVisible();
      const content = await controlledContent(page, show);
      await show.focus();
      if (activation === "click") await show.click();
      else await show.press(activation);
      await expect(show).toHaveAttribute("aria-expanded", "true");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toHaveCount(1);
      await expect(dialog).toHaveAttribute("id", await content.getAttribute("id"));
      await expect(dialog).toHaveAccessibleName(new RegExp(summary.title));
      await expect(dialog.getByRole("heading")).toContainText(summary.title);
      await expect(dialog.getByText(`${count} proposed dates`, { exact: true })).toBeVisible();
      await labels(dialog, dateLabels.slice(0, count));
      const close = dialog.getByRole("button", { name: /close/i });
      await expect(close).toBeVisible();
      assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true,
        "opening moves focus into the dialog");
      await close.focus();
      await page.keyboard.press("Tab");
      assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true,
        "Tab stays inside the modal");
      await page.keyboard.press("Shift+Tab");
      assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true,
        "Shift+Tab stays inside the modal");
      if (dismissal === "Escape") await page.keyboard.press("Escape");
      else await close.click();
      await expect(dialog).toBeHidden();
      await expect(show).toHaveAttribute("aria-expanded", "false");
      await expect(show).toBeFocused();
      await labels(entry, dateLabels.slice(0, datePreviewLimit));
      // Repeat opening catches stale dialog and detached-trigger focus handling.
      await show.press("Enter");
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(show).toBeFocused();
    });
  }

  for (const timezoneId of ["Europe/London", "America/Los_Angeles", "Pacific/Kiritimati"]) {
    test(`T-153 ${layout.name}: saved formatting/order survives ${timezoneId} in preview and disclosure`, async (t) => {
      const { page, entry } = await mount(t, layout, [compactSummary(4)], timezoneId);
      await labels(entry, dateLabels.slice(0, datePreviewLimit));
      await expect(entry.getByText("4 Oct 2026", { exact: true })).toBeVisible();
      const show = entry.getByRole("button", { name: "Show dates", exact: true });
      await expect(show).toBeVisible();
      const content = await controlledContent(page, show);
      await show.click();
      await labels(content, dateLabels.slice(0, 4));
    });
  }

  for (const count of [4, 9]) {
    test(`T-153 ${layout.name}: closed ${count}-date summary exposes the final choice outside the preview`, async (t) => {
      const summary = compactSummary(count, { status: "closed" });
      const { page, entry } = await mount(t, layout, [summary], "America/Los_Angeles");
      await expect(entry.getByText("Closed", { exact: true })).toBeVisible();
      await expect(entry.getByText(`Final date: ${dateLabels[count - 1]}`, { exact: true })).toBeVisible();
      await expect(entry.getByText(`${count} proposed dates`, { exact: true })).toBeVisible();
      const show = entry.getByRole("button", { name: "Show dates", exact: true });
      await expect(show).toHaveAttribute("aria-expanded", "false");
      const content = await controlledContent(page, show);
      await show.click();
      await labels(content, dateLabels.slice(0, count));
    });
  }

  test(`T-153 ${layout.name}: closed timed final date retains the selected repeated-hour offset`, async (t) => {
    const summary = compactSummary(4, { status: "closed" });
    summary.finalDate = structuredClone(summary.proposedDates[2]);
    const { entry } = await mount(t, layout, [summary], "Pacific/Kiritimati");
    await expect(entry.getByText(`Final date: ${dateLabels[2]}`, { exact: true })).toBeVisible();
    await expect(entry.getByText(`Final date: ${dateLabels[1]}`, { exact: true })).toHaveCount(0);
  });

  test(`T-153 ${layout.name}: sibling controls target unique content in both DOM variants`, async (t) => {
    const first = compactSummary(4);
    const second = compactSummary(8);
    const { page, entry } = await mount(t, layout, [first, second]);
    const sibling = page.locator(layout.selector).filter({ hasText: second.title });
    const show = entry.getByRole("button", { name: "Show dates", exact: true });
    await expect(show).toBeVisible();
    const content = await controlledContent(page, show);
    const other = sibling.getByRole("button", { name: "Show dates", exact: true });
    const otherContent = await controlledContent(page, other);
    const ids = await page.getByRole("button", { name: /^(Show|Hide) dates$/, includeHidden: true }).evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-controls")));
    assert.equal(new Set(ids).size, ids.length, "desktop/mobile and sibling disclosures cannot share IDs");
    await show.click();
    await expect(content).toBeVisible();
    await expect(otherContent).toBeHidden();
    await expect(other).toHaveAttribute("aria-expanded", "false");
  });
}
