import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { expect as playwrightExpect } from "@playwright/test";
import { startComponentBrowser } from "../support/frontend-component-harness.mjs";
import { createSummaryFixture, summaryRecords, summaryTitles } from "../support/my-polls-component-fixture.mjs";

const expect = playwrightExpect.configure({ timeout: 1_500 });
let components;
before(async () => { components = await startComponentBrowser(); });
after(async () => { await components?.close(); });

// Exercise the reusable UI's request/state boundary. T-146 supplies transport.
async function installShareConsumer(page, state = { status: "loading" }) {
  await page.addInitScript((initialState) => {
    window.shareRequests = [];
    document.addEventListener("poll-share-request", (event) => {
      event.preventDefault();
      window.shareRequests.push(event.detail.pollId);
      window.activeSharePanel = event.detail.panel;
      event.detail.panel.setState(initialState);
    });
  }, state);
}

for (const [layout, width, surface] of [
  ["desktop", 1024, ".my-polls-desktop"], ["mobile", 390, ".my-polls-mobile"]
]) {
  test(`${layout}: only Open/Closed share disclosures open inline and preserve list context`, async (t) => {
    const fixture = createSummaryFixture();
    const harness = await components.mount(t, { fixture, viewport: { width, height: 844 } });
    const { page } = harness;
    await installShareConsumer(page);
    await harness.goto("/?testRunId=olivia&filter=active&search=supper");
    const list = page.locator(surface);
    assert.equal(await list.getByRole("button", { name: `Share link for ${summaryTitles.draft}`, exact: true }).count(), 0);
    const trigger = list.getByRole("button", { name: `Share link for ${summaryTitles.open}`, exact: true });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    assert.equal(await page.getByLabel("Public poll link", { exact: true }).evaluateAll((inputs) =>
      inputs.every((input) => input.value === "")), true);
    assert.equal(harness.organiserRequests().filter(({ url }) => url.includes("share-link")).length, 0);
    const beforeUrl = page.url();
    const beforeRequests = harness.listRequests().length;
    const titles = await list.getByRole("link").allTextContents();
    await trigger.focus();
    await trigger.press("Enter");
    const panel = page.getByRole("region", { name: `Share link for ${summaryTitles.open}`, exact: true });
    await expect(panel).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-controls", await panel.getAttribute("id"));
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toHaveAttribute("aria-busy", "true");
    await expect(panel.getByRole("status")).toHaveText("Loading the public poll link…");
    await expect(panel.getByRole("button", { name: "Copy link", exact: true })).toBeDisabled();
    await expect(panel.getByRole("link", { name: "Open poll", exact: true })).toHaveCount(0);
    await trigger.click();
    assert.deepEqual(await page.evaluate(() => window.shareRequests), ["open-1"]);
    assert.equal(page.url(), beforeUrl);
    assert.equal(harness.listRequests().length, beforeRequests);
    assert.deepEqual(await list.getByRole("link").allTextContents(), titles);
    await panel.getByRole("button", { name: "Close share panel" }).focus();
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "Closed", exact: true }).click();
    await list.getByRole("button", { name: `Share link for ${summaryTitles.closed}`, exact: true }).click();
    await expect(page.getByRole("region", { name: `Share link for ${summaryTitles.closed}`, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "My polls", exact: true })).toBeVisible();
  });

  test(`${layout}: shared panel renders success, copy failure, retry and legacy states safely`, async (t) => {
    const harness = await components.mount(t, { fixture: createSummaryFixture(), viewport: { width, height: 844 } });
    const { page, fixture } = harness;
    const publicUrl = fixture.publicUrl("open-1");
    await installShareConsumer(page, { status: "ready", publicUrl });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { value: {
        writeText: async (text) => {
          if (window.failCopy) throw new Error("Clipboard denied");
          window.copiedText = text;
        }
      } });
    });
    await harness.goto("/?testRunId=olivia&filter=open");
    const trigger = page.locator(surface).getByRole("button", { name: `Share link for ${summaryTitles.open}`, exact: true });
    await trigger.click();
    const panel = page.getByRole("region", { name: `Share link for ${summaryTitles.open}`, exact: true });
    const input = panel.getByLabel("Public poll link", { exact: true });
    await expect(input).toHaveValue(publicUrl);
    await expect(input).toHaveAttribute("readonly", "");
    await expect(panel.getByRole("status")).toHaveText("Public poll link ready.");
    const open = panel.getByRole("link", { name: "Open poll", exact: true });
    await expect(open).toHaveAttribute("href", publicUrl);
    await expect(open).toHaveAttribute("target", "_blank");
    await expect(open).toHaveAttribute("rel", "noopener noreferrer");
    const copy = panel.getByRole("button", { name: "Copy link", exact: true });
    await copy.click();
    await expect(panel.getByRole("status")).toHaveText("Public poll link copied.");
    assert.equal(await page.evaluate(() => window.copiedText), publicUrl);
    await page.evaluate(() => { window.failCopy = true; });
    await panel.getByRole("button", { name: "Copied ✓", exact: true }).click();
    await expect(panel.getByRole("alert")).toHaveText(/Copying failed.*manually/);
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(publicUrl);
    await expect(open).toBeVisible();
    await page.evaluate(() => window.activeSharePanel.setState({ status: "error" }));
    await expect(input).toHaveValue("");
    await expect(panel.getByRole("alert")).toHaveText("We couldn't retrieve this poll's link. Try again.");
    await expect(open).toHaveCount(0);
    await panel.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(input).toHaveValue(publicUrl);
    await expect(panel.getByRole("alert")).toHaveCount(0);
    await page.evaluate(() => window.activeSharePanel.setState({ status: "legacy" }));
    await expect(input).toHaveValue("");
    await expect(panel.getByRole("status")).toHaveText(/existing link cannot be recovered.*confirmation.*old link/);
    await expect(panel.getByRole("button", { name: "Copy link", exact: true })).toBeDisabled();
    await expect(panel.getByRole("button", { name: "Regenerate link", exact: true })).toBeEnabled();
    await panel.getByRole("button", { name: "Close share panel" }).click();
    await expect(trigger).toBeFocused();
    await trigger.click();
    assert.deepEqual(await page.evaluate(() => window.shareRequests), ["open-1", "open-1", "open-1"]);
  });
}

test("share panels keep long untrusted titles and URLs within 320px and intermediate layouts", async (t) => {
  const records = summaryRecords();
  records[1].title = summaryTitles.long;
  for (const width of [320, 641]) {
    const harness = await components.mount(t, { fixture: createSummaryFixture({ records }), viewport: { width, height: 844 } });
    await installShareConsumer(harness.page, { status: "ready", publicUrl: harness.fixture.publicUrl("open-1") });
    await harness.goto("/?testRunId=olivia&filter=open");
    const surface = width <= 640 ? ".my-polls-mobile" : ".my-polls-desktop";
    await harness.page.locator(surface).getByRole("button", { name: `Share link for ${summaryTitles.long}`, exact: true }).click();
    assert.equal(await harness.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.equal(await harness.page.evaluate(() => window.summaryInjected), undefined);
    assert.equal(await harness.page.locator(`${surface} img`).count(), 0);
  }
});

test("regeneration requires confirmation and replaces the displayed URL", async (t) => {
  const base = createSummaryFixture();
  const oldUrl = base.publicUrl("open-1");
  const newUrl = `${new URL(oldUrl).origin}/p/${"r".repeat(32)}`;
  const fixture = {
    ...base,
    respond(request) {
      if (new URL(request.url).pathname === "/api/organiser/polls/open-1/share-link/rotate") {
        base.requests.push(structuredClone(request));
        return { status: 200, body: { publicUrl: newUrl } };
      }
      return base.respond(request);
    }
  };
  const harness = await components.mount(t, { fixture });
  const { page } = harness;
  await harness.goto("/?testRunId=olivia&filter=open");
  await page.locator(".my-polls-desktop").getByRole("button", { name: `Share link for ${summaryTitles.open}` }).click();
  const panel = page.getByRole("region", { name: `Share link for ${summaryTitles.open}` });
  await expect(panel.getByLabel("Public poll link")).toHaveValue(oldUrl);
  const regenerate = panel.getByRole("button", { name: "Regenerate link", exact: true });
  await regenerate.click();
  const dialog = page.getByRole("dialog", { name: "Regenerate public link" });
  await expect(dialog).toContainText("The current link will stop working immediately.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await regenerate.click();
  await page.keyboard.press("Escape");
  assert.equal(harness.organiserRequests().filter(({ url }) => url.endsWith("/rotate")).length, 0);
  await expect(panel.getByLabel("Public poll link")).toHaveValue(oldUrl);
  await regenerate.click();
  await dialog.getByRole("button", { name: "Regenerate link" }).click();
  await expect(panel.getByLabel("Public poll link")).toHaveValue(newUrl);
  await expect(panel.getByRole("status")).toHaveText(/old link no longer works/);
  assert.equal(harness.organiserRequests().filter(({ url, method }) => url.endsWith("/rotate") && method === "POST").length, 1);
});

test("legacy link stays untouched until confirmed rotation; conflict requests a read", async (t) => {
  const base = createSummaryFixture();
  let rotations = 0;
  const fixture = {
    ...base,
    respond(request) {
      const pathname = new URL(request.url).pathname;
      if (pathname === "/api/organiser/polls/open-1/share-link" && request.method === "GET") {
        base.requests.push(structuredClone(request));
        return { status: 409, body: { error: { code: "LINK_RECOVERY_REQUIRED", message: "The existing link cannot be recovered. Replacing it requires confirmation and will stop the old link working." } } };
      }
      if (pathname === "/api/organiser/polls/open-1/share-link/rotate") {
        base.requests.push(structuredClone(request));
        rotations++;
        return { status: 409, body: { error: { code: "LINK_ROTATION_CONFLICT", message: "The link changed" } } };
      }
      return base.respond(request);
    }
  };
  const harness = await components.mount(t, { fixture });
  const { page } = harness;
  await harness.goto("/?testRunId=olivia&filter=open");
  await page.locator(".my-polls-desktop").getByRole("button", { name: `Share link for ${summaryTitles.open}` }).click();
  const panel = page.getByRole("region", { name: `Share link for ${summaryTitles.open}` });
  await expect(panel.getByRole("status")).toContainText("existing link cannot be recovered");
  await panel.getByRole("button", { name: "Regenerate link", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  assert.equal(rotations, 0);
  await panel.getByRole("button", { name: "Regenerate link", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Regenerate link" }).click();
  await expect(panel.getByRole("alert")).toContainText("changed in another session");
  assert.equal(rotations, 1);
  await panel.getByRole("button", { name: "Try again" }).click();
  await expect(panel.getByRole("status")).toContainText("existing link cannot be recovered");
  assert.equal(rotations, 1);
});

test("retrieves the owner share URL only after opening a summary panel", async (t) => {
  const harness = await components.mount(t, { fixture: createSummaryFixture(), viewport: { width: 1024, height: 844 } });
  const { page, fixture } = harness;
  await harness.goto("/?testRunId=olivia&filter=open");
  assert.equal(harness.organiserRequests().filter(({ url }) => url.includes("/share-link")).length, 0);
  const trigger = page.locator(".my-polls-desktop").getByRole("button", { name: `Share link for ${summaryTitles.open}`, exact: true });
  await trigger.click();
  const panel = page.getByRole("region", { name: `Share link for ${summaryTitles.open}`, exact: true });
  await expect(panel.getByLabel("Public poll link", { exact: true })).toHaveValue(fixture.publicUrl("open-1"));
  assert.equal(harness.organiserRequests().filter(({ url }) => url.includes("/share-link")).length, 1);
  await expect(panel.getByRole("link", { name: "Open poll", exact: true })).toHaveAttribute("href", fixture.publicUrl("open-1"));
});

test("publication reuses share controls with copy feedback and original organiser navigation", async (t) => {
  const harness = await components.mount(t);
  const { page, fixture } = harness;
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: {
    writeText: async (text) => { window.copiedText = text; }
  } }));
  await harness.goto("/?pollId=draft-1&view=editor&testRunId=olivia&returnFilter=draft&returnSearch=dinner");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const panel = page.getByRole("region", { name: "Share this poll", exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Public poll link", { exact: true })).toHaveValue(fixture.publicUrl("draft-1"));
  await expect(panel.getByRole("link", { name: "Go to the poll", exact: true })).toHaveAttribute("href", /returnFilter=draft&returnSearch=dinner/);
  await expect(panel.getByRole("link", { name: "History", exact: true })).toHaveAttribute("href", /returnFilter=draft&returnSearch=dinner/);
  await expect(panel.getByRole("link", { name: "Open as a link holder", exact: true })).toHaveAttribute("href", fixture.publicUrl("draft-1"));
  await panel.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText("Public poll link copied.");
  assert.equal(await page.evaluate(() => window.copiedText), fixture.publicUrl("draft-1"));
});
