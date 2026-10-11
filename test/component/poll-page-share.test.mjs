import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { expect as playwrightExpect } from "@playwright/test";
import { startComponentBrowser } from "../support/frontend-component-harness.mjs";
import { createNavigationFixture } from "../support/organiser-navigation-fixture.mjs";
import { heldResponse } from "../support/my-polls-component-fixture.mjs";

const expect = playwrightExpect.configure({ timeout: 1_500 });
let components;
before(async () => { components = await startComponentBrowser(); });
after(async () => { await components?.close(); });

// T-164 / S-060: intentionally red until sharing lives on the owner poll page.
// Mount the real application; do not inject a share panel or its state.
const share = (page) => page.getByRole("region", { name: "Share poll", exact: true });
const participantLink = (page) => share(page).getByRole("link", { name: /^Open as (?:a )?(?:participant|link holder)$/ });
const shareRequests = (fixture) => fixture.requests.filter(({ url }) => new URL(url).pathname.includes("/share-link"));
const destination = (id, owner = "olivia") => `/?pollId=${id}&testRunId=${owner}&returnFilter=closed&returnSearch=dinner`;

async function noShareControls(page) {
  await expect(share(page)).not.toBeVisible();
  await expect(page.getByLabel("Public poll link", { exact: true })).not.toBeVisible();
  await expect(page.getByRole("button", { name: /^(?:Copy link|Regenerate link|Retrieve current link)$/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Open as (?:a )?(?:participant|link holder)$/ })).toHaveCount(0);
}

async function clipboard(page) {
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: {
    writeText: async (text) => {
      if (window.denyClipboard) throw new Error("Clipboard denied");
      window.copiedText = text;
    }
  } }));
}

for (const [layout, width] of [["desktop", 1024], ["mobile", 390]]) {
  test(`T-164 ${layout}: drafts expose no public-link controls or recovery requests`, async (t) => {
    const harness = await components.mount(t, { viewport: { width, height: 844 } });
    await harness.goto(`${destination("draft-1")}&view=editor`);
    await expect(harness.page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Olivia draft dinner");
    await noShareControls(harness.page);
    assert.deepEqual(shareRequests(harness.fixture), []);
  });

  for (const state of ["open", "closed"]) {
    test(`T-164 ${layout}: ${state} owner poll page retrieves, copies and opens its current link`, async (t) => {
      const harness = await components.mount(t, { viewport: { width, height: 844 } });
      const { page, fixture } = harness;
      const id = `${state}-1`;
      const before = structuredClone([...fixture.records]);
      await clipboard(page);
      await harness.goto(destination(id));
      await expect(page.getByRole("region", { name: "Organiser controls" })).toBeVisible();
      await expect(share(page)).toBeVisible();
      const input = share(page).getByLabel("Public poll link", { exact: true });
      await expect(input).toHaveValue(fixture.publicUrl(id));
      await expect(input).toHaveAttribute("readonly", "");
      await expect(share(page).getByRole("status")).toHaveText("Public poll link ready.");
      await share(page).getByRole("button", { name: "Copy link", exact: true }).click();
      await expect(share(page).getByRole("status")).toHaveText("Public poll link copied.");
      assert.equal(await page.evaluate(() => window.copiedText), fixture.publicUrl(id));
      await expect(participantLink(page)).toHaveAttribute("href", fixture.publicUrl(id));
      await expect(participantLink(page)).toHaveAttribute("target", "_blank");
      await expect(participantLink(page)).toHaveAttribute("rel", "noopener noreferrer");
      const route = new URL(page.url());
      assert.equal(route.searchParams.get("pollId"), id);
      assert.equal(route.searchParams.get("returnFilter"), "closed");
      assert.equal(route.searchParams.get("returnSearch"), "dinner");
      assert.deepEqual([...fixture.records], before);
      assert.equal(shareRequests(fixture).length, 1);
      assert.equal(shareRequests(fixture)[0].method, "GET");
      assert.equal(shareRequests(fixture)[0].identity, "local-organiser-olivia");
      assert.equal(shareRequests(fixture)[0].body, undefined);
      assert.equal(new URL(shareRequests(fixture)[0].url).search, "");
    });
  }

  test(`T-164 ${layout}: My polls has no per-result panels and leads to canonical sharing`, async (t) => {
    const harness = await components.mount(t, { viewport: { width, height: 844 } });
    const { page, fixture } = harness;
    await harness.goto("/?testRunId=olivia&filter=open&search=dinner");
    await expect(page.getByRole("heading", { name: "My polls", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: /^(?:Share poll|Share link for .*)$/, includeHidden: true })).toHaveCount(0);
    assert.deepEqual(shareRequests(fixture), []);
    await page.locator(`.my-polls-${layout}`).getByRole("link", { name: "Olivia open dinner", exact: true }).click();
    await expect(share(page)).toBeVisible();
    await expect(share(page).getByLabel("Public poll link", { exact: true })).toHaveValue(fixture.publicUrl("open-1"));
    assert.equal(new URL(page.url()).searchParams.get("pollId"), "open-1");
  });

  test(`T-164 ${layout}: publication lands on the owner poll page with status, focus and reload recovery`, async (t) => {
    const harness = await components.mount(t, { viewport: { width, height: 844 } });
    const { page, fixture } = harness;
    await harness.goto(`${destination("draft-1")}&view=editor`);
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByTestId("public-state")).toHaveText("Open");
    await expect(share(page)).toBeVisible();
    await expect(share(page).getByLabel("Public poll link", { exact: true })).toHaveValue(fixture.publicUrl("draft-1"));
    await expect(share(page).getByRole("status")).toContainText(/(?:ready|published)/i);
    // Publication must produce a reloadable management destination, not stay in the editor.
    await expect(page).toHaveURL((url) => url.searchParams.get("pollId") === "draft-1" && url.searchParams.get("view") !== "editor");
    assert.equal(await page.evaluate(() => {
      const focused = document.activeElement;
      return focused?.closest('[aria-label="Share poll"]') !== null || focused?.matches("h1") === true;
    }), true, "publication moves focus to sharing or the poll heading");
    await page.reload();
    await expect(share(page).getByLabel("Public poll link", { exact: true })).toHaveValue(fixture.publicUrl("draft-1"));
    assert.ok(shareRequests(fixture).some(({ method, url }) => method === "GET" && new URL(url).pathname.endsWith("/draft-1/share-link")));
    assert.equal(fixture.requests.filter(({ url }) => new URL(url).pathname.endsWith("/publish")).length, 1);
  });
}

for (const state of ["draft", "open", "closed"]) {
  test(`T-164 ${state}: another owner cannot access poll-page share controls`, async (t) => {
    const harness = await components.mount(t);
    await harness.goto(destination(`${state}-1`, "sam"));
    await expect(harness.page.getByRole("alert").filter({ hasText: /organiser|own|permission/i })).toBeVisible();
    await noShareControls(harness.page);
    await expect(harness.page.getByRole("region", { name: "Organiser controls" })).not.toBeVisible();
    assert.deepEqual(shareRequests(harness.fixture), []);
    assert.equal(harness.organiserRequests().every(({ method }) => method === "GET"), true);
  });
}

for (const state of ["open", "closed"]) {
  for (const query of ["", "?organiser=1&testRunId=sam"]) {
    test(`T-164 ${state}: link holder ${query ? "claiming ownership" : "without owner context"} has no organiser actions`, async (t) => {
      const harness = await components.mount(t);
      const publicUrl = harness.fixture.publicUrl(`${state}-1`);
      await harness.goto(`${new URL(publicUrl).pathname}${query}`);
      await expect(harness.page.getByRole("heading", { name: `Olivia ${state} dinner`, exact: true })).toBeVisible();
      await noShareControls(harness.page);
      await expect(harness.page.getByRole("region", { name: "Organiser controls" })).not.toBeVisible();
      await expect(harness.page.getByRole("link", { name: /^(?:History|Edit poll|Edit dates)$/ })).toHaveCount(0);
      await expect(harness.page.getByRole("button", { name: /^(?:History|Edit poll|Edit dates|Edit location|Reopen poll.*|Confirm & close poll|Close poll.*)$/ })).toHaveCount(0);
      assert.deepEqual(shareRequests(harness.fixture), []);
      assert.equal(harness.organiserRequests().every(({ method }) => method === "GET"), true);
    });
  }
}

test("T-164 recovery loading and retry never reveal a failed URL or perform a rotation", async (t) => {
  const base = createNavigationFixture();
  const held = heldResponse({ status: 500, body: { error: { code: "INTERNAL_ERROR", message: "private-token-detail" } } });
  let reads = 0;
  const fixture = { ...base, dispose: () => held.dispose(), respond(request) {
    if (new URL(request.url).pathname === "/api/organiser/polls/open-1/share-link") {
      base.requests.push(structuredClone(request));
      return ++reads === 1 ? held.promise : { status: 200, body: { publicUrl: base.publicUrl("open-1") } };
    }
    return base.respond(request);
  } };
  const { page, goto } = await components.mount(t, { fixture });
  await goto(destination("open-1"));
  await expect(share(page)).toHaveAttribute("aria-busy", "true");
  await expect(share(page).getByLabel("Public poll link", { exact: true })).toHaveValue("");
  await expect(share(page).getByRole("button", { name: "Copy link", exact: true })).toBeDisabled();
  held.release();
  await expect(share(page).getByRole("alert")).toHaveText("We couldn't retrieve this poll's link. Try again.");
  await expect(share(page)).not.toContainText("private-token-detail");
  await expect(participantLink(page)).toHaveCount(0);
  await share(page).getByRole("button", { name: "Try again", exact: true }).click();
  await expect(share(page).getByLabel("Public poll link", { exact: true })).toHaveValue(base.publicUrl("open-1"));
  assert.equal(reads, 2);
  assert.equal(shareRequests(fixture).every(({ method }) => method === "GET"), true);
});

test("T-164 clipboard denial keeps the current link available for manual copy", async (t) => {
  const harness = await components.mount(t);
  const { page, fixture } = harness;
  await clipboard(page);
  await harness.goto(destination("open-1"));
  await expect(share(page).getByLabel("Public poll link", { exact: true })).toHaveValue(fixture.publicUrl("open-1"));
  await page.evaluate(() => { window.denyClipboard = true; });
  await share(page).getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(share(page).getByRole("alert")).toContainText(/copy.*manually/i);
  await expect(share(page).getByLabel("Public poll link", { exact: true })).toBeFocused();
  await expect(participantLink(page)).toHaveAttribute("href", fixture.publicUrl("open-1"));
  assert.equal(shareRequests(fixture).every(({ method }) => method === "GET"), true);
});

test("T-164 poll-page rotation requires confirmation, retains data and replaces the displayed URL", async (t) => {
  const base = createNavigationFixture();
  const original = base.publicUrl("open-1");
  const replacement = `${new URL(original).origin}/p/${"r".repeat(32)}`;
  const fixture = { ...base, respond(request) {
    if (new URL(request.url).pathname === "/api/organiser/polls/open-1/share-link/rotate") {
      base.requests.push(structuredClone(request));
      assert.equal(request.method, "POST");
      assert.equal(request.identity, "local-organiser-olivia");
      for (const [token, id] of base.tokens) if (id === "open-1") base.tokens.delete(token);
      base.tokens.set("r".repeat(32), "open-1");
      return { status: 200, body: { publicUrl: replacement } };
    }
    return base.respond(request);
  } };
  const harness = await components.mount(t, { fixture });
  const { page } = harness;
  const before = structuredClone([...base.records]);
  await harness.goto(destination("open-1"));
  await expect(share(page).getByLabel("Public poll link", { exact: true })).toHaveValue(original);
  const regenerate = share(page).getByRole("button", { name: "Regenerate link", exact: true });
  const dialog = page.getByRole("dialog", { name: "Regenerate public link", exact: true });
  await regenerate.click();
  await expect(dialog).toContainText("The current link will stop working immediately.");
  await expect(dialog).toContainText("Anyone using it will need the new link.");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await regenerate.click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  assert.equal(shareRequests(fixture).filter(({ method }) => method === "POST").length, 0);
  await expect(share(page).getByLabel("Public poll link", { exact: true })).toHaveValue(original);
  await regenerate.click();
  await dialog.getByRole("button", { name: "Regenerate link", exact: true }).click();
  await expect(share(page).getByLabel("Public poll link", { exact: true })).toHaveValue(replacement);
  await expect(share(page).getByRole("status")).toContainText("The old link no longer works.");
  await expect(participantLink(page)).toHaveAttribute("href", replacement);
  assert.equal(shareRequests(fixture).filter(({ method }) => method === "POST").length, 1);
  assert.deepEqual([...base.records], before);
});
