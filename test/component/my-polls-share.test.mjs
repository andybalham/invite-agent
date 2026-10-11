import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { expect as playwrightExpect } from "@playwright/test";
import { startComponentBrowser } from "../support/frontend-component-harness.mjs";
import { heldResponse, summaryTitles } from "../support/my-polls-component-fixture.mjs";
import { createNavigationFixture } from "../support/organiser-navigation-fixture.mjs";

const expect = playwrightExpect.configure({ timeout: 1_500 });
let components;
before(async () => { components = await startComponentBrowser(); });
after(async () => { await components?.close(); });

// T-151 transport regressions now exercise the canonical S-060 poll page.
for (const [layout, width] of [["desktop", 1024], ["mobile", 390]]) {
  test(`${layout}: pending recovery is discarded after leaving the owner context`, async (t) => {
    const base = createNavigationFixture();
    const held = heldResponse({ status: 200, body: { publicUrl: base.publicUrl("open-1") } });
    let reads = 0;
    const fixture = { ...base, dispose: () => held.dispose(), respond(request) {
      if (new URL(request.url).pathname === "/api/organiser/polls/open-1/share-link") {
        base.requests.push(structuredClone(request));
        reads++;
        return reads === 1 ? held.promise : { status: 200, body: { publicUrl: base.publicUrl("open-1") } };
      }
      return base.respond(request);
    } };
    const harness = await components.mount(t, { fixture, viewport: { width, height: 844 } });
    const { page } = harness;
    await harness.goto("/?pollId=open-1&testRunId=olivia&returnFilter=active&returnSearch=supper");
    const beforeUrl = page.url();
    const beforeRecords = structuredClone([...base.records]);
    const panel = page.getByRole("region", { name: "Share poll", exact: true });
    await expect(panel).toHaveAttribute("aria-busy", "true");
    await expect(panel.getByLabel("Public poll link", { exact: true })).toHaveValue("");
    await expect(panel.getByRole("button", { name: "Copy link", exact: true })).toBeDisabled();
    assert.equal(reads, 1);
    await page.evaluate(() => {
      history.pushState({}, "", "/?pollId=open-1&testRunId=sam");
      dispatchEvent(new PopStateEvent("popstate"));
    });
    const received = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/open-1/share-link"));
    held.release();
    await received;
    await expect(panel).not.toBeVisible();
    await harness.goto(beforeUrl);
    await expect(panel.getByLabel("Public poll link", { exact: true })).toHaveValue(base.publicUrl("open-1"));
    assert.equal(reads, 2);
    assert.equal(page.url(), beforeUrl);
    assert.deepEqual([...base.records], beforeRecords);
    assert.equal(harness.listRequests().length, 0, "direct poll-page recovery never reads dashboard summaries");
    for (const request of base.requests.filter(({ url }) => url.includes("/share-link"))) {
      assert.equal(request.method, "GET");
      assert.equal(request.identity, "local-organiser-olivia");
      assert.equal(request.body, undefined);
      assert.equal(new URL(request.url).search, "");
    }
  });

  test(`${layout}: lost rotation response recovers the committed URL without another write`, async (t) => {
    const harness = await components.mount(t, { fixture: createNavigationFixture(), viewport: { width, height: 844 } });
    const { page, fixture } = harness;
    const replacementToken = "r".repeat(32);
    const replacement = `${new URL(fixture.publicUrl("open-1")).origin}/p/${replacementToken}`;
    let rotations = 0;
    await page.route("**/api/organiser/polls/open-1/share-link/rotate", async (route) => {
      rotations++;
      for (const [token, id] of fixture.tokens) if (id === "open-1") fixture.tokens.delete(token);
      fixture.tokens.set(replacementToken, "open-1");
      // Model a committed rotation whose response never reaches the client.
      await route.abort("connectionfailed");
    });
    await harness.goto("/?pollId=open-1&testRunId=olivia");
    const panel = page.getByRole("region", { name: "Share poll", exact: true });
    await expect(panel.getByLabel("Public poll link", { exact: true })).toHaveValue(fixture.publicUrl("open-1"));
    await panel.getByRole("button", { name: "Regenerate link", exact: true }).click();
    await page.getByRole("dialog", { name: "Regenerate public link", exact: true })
      .getByRole("button", { name: "Regenerate link", exact: true }).click();
    await expect(panel.getByRole("status")).toHaveText("The rotation result was uncertain. This is the current public link.");
    await expect(panel.getByLabel("Public poll link", { exact: true })).toHaveValue(replacement);
    assert.equal(rotations, 1);
    assert.equal(harness.organiserRequests().filter(({ url, method }) => url.endsWith("/share-link") && method === "GET").length, 2);
  });

  for (const [status, code, message] of [
    [401, "UNAUTHENTICATED", "Sign in to retrieve this poll's link."],
    [403, "FORBIDDEN", "You don't have permission to share this poll."],
    [404, "NOT_FOUND", "This poll is no longer available."],
    [410, "LINK_REVOKED", "This poll's public link is no longer active."],
    [500, "INTERNAL_ERROR", "We couldn't retrieve this poll's link. Try again."],
    [200, "MALFORMED_SUCCESS", "We couldn't retrieve this poll's link. Try again."]
  ]) {
    test(`${layout}: ${code} recovery failure is safe and retry performs only a read`, async (t) => {
      const base = createNavigationFixture();
      let reads = 0;
      const fixture = { ...base, respond(request) {
        if (new URL(request.url).pathname === "/api/organiser/polls/open-1/share-link") {
          base.requests.push(structuredClone(request));
          reads++;
          if (reads === 1) return { status, body: status === 200
            ? { publicUrl: "javascript:window.summaryInjected=true" }
            : { error: { code, message: "sensitive-server-detail" } } };
          return { status: 200, body: { publicUrl: base.publicUrl("open-1") } };
        }
        return base.respond(request);
      } };
      const harness = await components.mount(t, { fixture, viewport: { width, height: 844 } });
      const { page } = harness;
      await harness.goto("/?pollId=open-1&testRunId=olivia");
      const panel = page.getByRole("region", { name: "Share poll", exact: true });
      await expect(panel.getByRole("alert")).toHaveText(message);
      await expect(panel.getByLabel("Public poll link", { exact: true })).toHaveValue("");
      await expect(panel.getByRole("button", { name: "Copy link", exact: true })).toBeDisabled();
      await expect(panel.getByRole("button", { name: "Regenerate link", exact: true })).toBeDisabled();
      await expect(panel.getByRole("link", { name: "Open as a participant", exact: true })).toHaveCount(0);
      await expect(panel).not.toContainText("sensitive-server-detail");
      await panel.getByRole("button", { name: "Try again", exact: true }).click();
      await expect(panel.getByLabel("Public poll link", { exact: true })).toHaveValue(base.publicUrl("open-1"));
      await expect(panel.getByRole("alert")).toHaveCount(0);
      assert.equal(reads, 2);
      assert.equal(harness.organiserRequests().every(({ method }) => method === "GET"), true);
    });
  }
}

for (const [layout, width] of [["desktop", 1024], ["mobile", 390]]) {
test(`${layout}: legacy link stays untouched until confirmed rotation; conflict requests a read`, async (t) => {
  const base = createNavigationFixture();
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
  const harness = await components.mount(t, { fixture, viewport: { width, height: 844 } });
  const { page } = harness;
  await harness.goto("/?pollId=open-1&testRunId=olivia");
  const panel = page.getByRole("region", { name: "Share poll" });
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
}


test("canonical sharing keeps untrusted titles and links within narrow layouts", async (t) => {
  for (const width of [320, 641]) {
    const fixture = createNavigationFixture();
    fixture.records.get("open-1").title = summaryTitles.long;
    const harness = await components.mount(t, { fixture, viewport: { width, height: 844 } });
    await harness.goto("/?pollId=open-1&testRunId=olivia");
    const panel = harness.page.getByRole("region", { name: "Share poll", exact: true });
    await expect(panel.getByLabel("Public poll link", { exact: true })).toHaveValue(fixture.publicUrl("open-1"));
    assert.equal(await harness.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await harness.page.evaluate(() => window.summaryInjected), undefined);
    assert.equal(await harness.page.locator(".public-poll img").count(), 0);
  }
});
