import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { expect as playwrightExpect } from "@playwright/test";
import { startComponentBrowser } from "../support/frontend-component-harness.mjs";
import { navigationOwners } from "../support/organiser-navigation-fixture.mjs";

const expect = playwrightExpect.configure({ timeout: 1_500 });
let components;
before(async () => { components = await startComponentBrowser(); });
after(async () => { await components?.close(); });

async function dashboard(page) {
  await expect(page.getByRole("heading", { name: "My polls", exact: true })).toBeVisible();
  await expect(page.getByLabel(/^Title(?:\s*\*)?$/)).not.toBeVisible();
}

async function selectFilter(page, name) {
  // Accept standard accessible filter controls without prescribing their markup.
  await page.getByRole("button", { name, exact: true })
    .or(page.getByRole("tab", { name, exact: true }))
    .or(page.getByRole("radio", { name, exact: true })).click();
}

async function returnToMyPolls(harness) {
  const { page } = harness;
  const link = page.getByRole("link", { name: /^(?:←\s*)?My polls$/ });
  await expect(link).toBeVisible();
  await link.click();
  await dashboard(page);
  await expect.poll(() => harness.listRequests().length).toBeGreaterThan(0);
  const request = harness.listRequests().at(-1);
  assert.equal(request.identity, navigationOwners.olivia, "return retains the simulated organiser identity");
  assert.equal(new URL(request.url).searchParams.get("filter") ?? "active", "active");
}

async function management(page, poll) {
  await expect(page.getByRole("heading", { name: poll.title, exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Organiser controls" })).toBeVisible();
  await expect(page.getByTestId("public-state")).toHaveText(poll.status === "closed" ? "Closed" : "Open");
  await expect(page.getByLabel(/^Title(?:\s*\*)?$/)).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "My polls", exact: true })).not.toBeVisible();
}

// MP-US-01: normal entry, including the existing default/sanitized local identity.
for (const [label, route, owner] of [
  ["explicit identity", "/?testRunId=olivia", navigationOwners.olivia],
  ["default browser identity", "/", "local-organiser-browser"],
  ["normalized simulated identity", "/?testRunId=OLIVIA%20QA", "local-organiser-olivia-qa"]
]) {
  test(`normal organiser entry opens My polls with ${label}`, async (t) => {
    const harness = await components.mount(t, { owner });
    await harness.goto(route);
    await dashboard(harness.page);
    await expect(harness.page.getByRole("link", { name: "Olivia draft dinner", exact: true })).toBeVisible();
    await expect.poll(() => harness.listRequests().length).toBe(1);
    const request = harness.listRequests()[0];
    assert.equal(request.identity, owner);
    assert.equal(new URL(request.url).searchParams.get("filter") ?? "active", "active");
    assert.equal(new URL(request.url).searchParams.get("search") ?? "", "");
    assert.equal(harness.fixture.requests.some(({ method }) => method !== "GET"), false);
  });
}

// MP-US-07: use the actual form and transport, rather than a replacement editor.
test("Create poll opens existing creation, saves a draft and returns to Active My polls", async (t) => {
  const harness = await components.mount(t);
  const { page, fixture } = harness;
  await harness.goto("/?testRunId=olivia");
  await page.getByRole("button", { name: "Create poll", exact: true })
    .or(page.getByRole("link", { name: "Create poll", exact: true })).click();
  await expect(page.getByLabel(/^Title(?:\s*\*)?$/)).toBeEditable();
  await expect(page.getByLabel(/^Title(?:\s*\*)?$/)).toHaveValue("");
  await page.getByLabel(/^Title(?:\s*\*)?$/).fill("New route fixture dinner");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByTestId("draft-form").getByRole("status")).toContainText("Draft saved");
  const creation = fixture.requests.filter(({ method, url }) =>
    method === "POST" && new URL(url).pathname === "/api/organiser/polls");
  assert.equal(creation.length, 1);
  assert.equal(creation[0].identity, navigationOwners.olivia);
  assert.equal(creation[0].body.title, "New route fixture dinner");
  await returnToMyPolls(harness);
  await expect(page.getByRole("link", { name: "New route fixture dinner", exact: true })).toBeVisible();
});

test("unsaved creation has a visible My polls return without creating a poll", async (t) => {
  const harness = await components.mount(t);
  await harness.goto("/?testRunId=olivia");
  await harness.page.getByRole("button", { name: "Create poll", exact: true })
    .or(harness.page.getByRole("link", { name: "Create poll", exact: true })).click();
  await expect(harness.page.getByLabel(/^Title(?:\s*\*)?$/)).toBeEditable();
  await returnToMyPolls(harness);
  assert.equal(harness.fixture.requests.some(({ method }) => method !== "GET"), false);
});

test("creation from Closed returns the saved draft to default Active", async (t) => {
  const harness = await components.mount(t);
  const { page } = harness;
  await harness.goto("/?testRunId=olivia&filter=closed");
  await dashboard(page);
  await page.getByRole("link", { name: "Create poll", exact: true }).click();
  await page.getByLabel(/^Title(?:\s*\*)?$/).fill("New active draft");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByTestId("draft-form").getByRole("status")).toContainText("Draft saved");
  await returnToMyPolls(harness);
  await expect(page.getByRole("link", { name: "New active draft", exact: true })).toBeVisible();
});

// MP-US-08: state-specific title destinations and visible return links.
for (const [id, filter] of [["draft-1", "Active"], ["open-1", "Active"], ["closed-1", "Closed"]]) {
  test(`${id} title opens its existing ${id.startsWith("draft") ? "editor" : "management view"}`, async (t) => {
    const harness = await components.mount(t);
    const { page, fixture } = harness;
    const poll = fixture.records.get(id);
    await harness.goto("/?testRunId=olivia");
    await dashboard(page);
    if (filter !== "Active") await selectFilter(page, filter);
    await page.getByRole("link", { name: poll.title, exact: true }).click();
    if (poll.status === "draft") {
      await expect(page.getByLabel(/^Title(?:\s*\*)?$/)).toHaveValue(poll.title);
      await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeVisible();
    } else await management(page, poll);
    await expect(page.getByRole("link", { name: /^(?:←\s*)?My polls$/ })).toBeVisible();
    await page.getByRole("link", { name: /^(?:←\s*)?My polls$/ }).click();
    await dashboard(page);
    await expect(page.getByRole("link", { name: poll.title, exact: true })).toBeVisible();
    assert.equal(harness.listRequests().at(-1).identity, navigationOwners.olivia);
  });
}

// Existing deep links must take precedence over the new organiser landing page.
test("direct organiser draft URL opens the editor without loading My polls", async (t) => {
  const harness = await components.mount(t);
  await harness.goto("/?pollId=draft-1&testRunId=olivia");
  await expect(harness.page.getByLabel(/^Title(?:\s*\*)?$/)).toHaveValue("Olivia draft dinner");
  assert.equal(harness.listRequests().length, 0);
});

test("direct organiser history URL opens history without loading My polls", async (t) => {
  const harness = await components.mount(t);
  await harness.goto("/?pollId=open-1&view=history&testRunId=olivia");
  await expect(harness.page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await expect(harness.page.locator(".history-summary")).toContainText("0 changes");
  assert.equal(harness.listRequests().length, 0);
});

for (const id of ["open-1", "closed-1"]) {
  test(`direct organiser poll URL for ${id} opens management without loading My polls`, async (t) => {
    const harness = await components.mount(t);
    await harness.goto(`/?pollId=${id}&testRunId=olivia`);
    await management(harness.page, harness.fixture.records.get(id));
    assert.equal(harness.listRequests().length, 0);
  });

  test(`existing organiser capability URL for ${id} retains owner controls without loading My polls`, async (t) => {
    const harness = await components.mount(t);
    await harness.goto(`${harness.fixture.publicUrl(id)}?organiser=1&testRunId=olivia`);
    await management(harness.page, harness.fixture.records.get(id));
    assert.equal(harness.listRequests().length, 0);
  });
}

for (const route of [
  "/?pollId=draft-1&testRunId=olivia",
  `/p/${"o".repeat(32)}?organiser=1&testRunId=olivia`,
  `/p/${"c".repeat(32)}?organiser=1&testRunId=olivia`
]) {
  test(`direct organiser view provides a working visible My polls return: ${route}`, async (t) => {
    const harness = await components.mount(t);
    await harness.goto(route);
    await returnToMyPolls(harness);
    await expect(harness.page.getByRole("link", { name: "Olivia draft dinner", exact: true })).toBeVisible();
  });
}

// MP-US-09: publication must land on management, with both sharing and return.
test("management reached by poll ID retains the existing protected location action", async (t) => {
  const harness = await components.mount(t);
  const { page, fixture } = harness;
  await harness.goto("/?pollId=open-1&testRunId=olivia");
  await management(page, fixture.records.get("open-1"));
  await page.getByRole("button", { name: "Edit location", exact: true }).click();
  await page.getByLabel("Plain text or Markdown links", { exact: true }).fill("The hall");
  await page.getByRole("button", { name: "Save location", exact: true }).click();
  await expect(page.locator(".public-location")).toContainText("The hall");
  assert.equal(fixture.requests.some(({ url }) => new URL(url).pathname.startsWith("/api/public/")), false);
  const update = fixture.requests.find(({ url, method }) =>
    method === "PUT" && new URL(url).pathname.endsWith("/open-1/location"));
  assert.equal(update.identity, navigationOwners.olivia);
  assert.deepEqual(update.body, { location: "The hall" });
});

test("publication stays on the same poll management view with its issued share link", async (t) => {
  const harness = await components.mount(t);
  const { page, fixture } = harness;
  await harness.goto("/?pollId=draft-1&testRunId=olivia");
  await expect(page.getByLabel(/^Title(?:\s*\*)?$/)).toHaveValue("Olivia draft dinner");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect.poll(() => fixture.requests.filter(({ url, method }) =>
    new URL(url).pathname.endsWith("/draft-1/publish") && method === "POST").length).toBe(1);
  await management(page, fixture.records.get("draft-1"));
  await expect(page.getByLabel("Public poll link", { exact: true })).toHaveValue(fixture.publicUrl("draft-1"));
  await page.dispatchEvent("body", "focus");
  await expect.poll(() => fixture.requests.filter(({ url }) =>
    new URL(url).pathname.startsWith("/api/public/")).length).toBeGreaterThan(1);
  await expect(page.getByLabel("Public poll link", { exact: true })).toHaveValue(fixture.publicUrl("draft-1"));
  await returnToMyPolls(harness);
  await selectFilter(page, "Open");
  await expect(page.getByRole("link", { name: "Olivia draft dinner", exact: true })).toBeVisible();
});

// MP-US-11: exercise real capability rendering, including conflicting organiser
// query parameters. A plain public URL never sends simulated owner credentials.
for (const [id, suffix] of [["open-1", ""], ["closed-1", ""], ["open-1", "?pollId=draft-1&view=history&testRunId="]]) {
  test(`unauthenticated direct public ${id} capability opens without organiser interception (${suffix || "plain URL"})`, async (t) => {
    const harness = await components.mount(t);
    const { page, fixture } = harness;
    const route = `${fixture.publicUrl(id)}${suffix}`;
    await harness.goto(route);
    await expect(page.getByRole("heading", { name: fixture.records.get(id).title, exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Organiser controls" })).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "My polls", exact: true })).not.toBeVisible();
    if (id === "closed-1") {
      await expect(page.getByRole("button", { name: "+ Add a row", exact: true })).not.toBeVisible();
      await expect(page.locator(".closed-notice")).toBeVisible();
    } else await expect(page.getByRole("button", { name: "+ Add a row", exact: true })).toBeVisible();
    assert.equal(page.url(), route, "public capability and query remain intact");
    assert.equal(harness.organiserRequests().length, 0);
    assert.equal(fixture.requests.filter(({ url }) => new URL(url).pathname.startsWith("/api/public/"))
      .every(({ identity }) => identity === undefined), true);
  });
}

test("unknown public capability renders the existing invalid-link state without organiser interception", async (t) => {
  const harness = await components.mount(t);
  await harness.goto(`/p/${"x".repeat(32)}?testRunId=`);
  await expect(harness.page.locator(".public-invalid-link")).toBeVisible();
  await expect(harness.page.getByRole("heading", { name: "My polls", exact: true })).not.toBeVisible();
  assert.equal(harness.organiserRequests().length, 0);
});

// Explicit empty testRunId is distinct from a missing one: local-organiser- is
// rejected by existing local auth. This specifies no new sign-in mechanism.
test("empty simulated identity shows authentication-required My polls without owner summaries", async (t) => {
  const harness = await components.mount(t);
  await harness.goto("/?testRunId=");
  await expect(harness.page.getByText("Sign in to view your polls.", { exact: true })).toBeVisible();
  await expect(harness.page.getByRole("link", { name: "Olivia draft dinner", exact: true })).not.toBeVisible();
  assert.equal(harness.listRequests()[0]?.identity, "local-organiser-");
  assert.equal(harness.fixture.requests.some(({ method }) => method !== "GET"), false);
});

test("empty simulated identity on a direct organiser draft retains the existing authentication boundary", async (t) => {
  const harness = await components.mount(t);
  await harness.goto("/?pollId=draft-1&testRunId=");
  await expect(harness.page.getByTestId("draft-form").getByRole("alert")).toContainText("Local organiser authentication is required");
  await expect(harness.page.getByLabel(/^Title(?:\s*\*)?$/)).toHaveValue("");
  assert.equal(harness.listRequests().length, 0);
  assert.equal(harness.organiserRequests()[0]?.identity, "local-organiser-");
});

for (const testRunId of ["", "sam"]) {
  test(`a public capability with organiser intent cannot grant owner controls to ${testRunId || "empty identity"}`, async (t) => {
    const harness = await components.mount(t);
    await harness.goto(`${harness.fixture.publicUrl("open-1")}?organiser=1&testRunId=${testRunId}`);
    await expect(harness.page.getByRole("heading", { name: "Olivia open dinner", exact: true })).toBeVisible();
    await expect(harness.page.getByRole("region", { name: "Organiser controls" })).not.toBeVisible();
    assert.equal(harness.listRequests().length, 0);
    assert.equal(harness.organiserRequests()[0]?.identity,
      testRunId ? navigationOwners.sam : "local-organiser-");
  });
}

test("changing the existing URL identity reloads My polls for the new organiser without old summaries", async (t) => {
  const harness = await components.mount(t);
  const { page } = harness;
  await harness.goto("/?testRunId=olivia");
  await expect(page.getByRole("link", { name: "Olivia draft dinner", exact: true })).toBeVisible();
  await harness.goto("/?testRunId=sam");
  await dashboard(page);
  await expect(page.getByRole("link", { name: "Sam private planning", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Olivia/ })).not.toBeVisible();
  assert.deepEqual(harness.listRequests().map(({ identity }) => identity), [navigationOwners.olivia, navigationOwners.sam]);
  await harness.goto("/?testRunId=");
  await expect(page.getByText("Sign in to view your polls.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sam private planning", exact: true })).not.toBeVisible();
});

test("changing identity on a direct draft denies another organiser without redirecting to My polls", async (t) => {
  const harness = await components.mount(t);
  await harness.goto("/?pollId=draft-1&testRunId=olivia");
  await expect(harness.page.getByLabel(/^Title(?:\s*\*)?$/)).toHaveValue("Olivia draft dinner");
  await harness.goto("/?pollId=draft-1&testRunId=sam");
  await expect(harness.page.getByTestId("draft-form").getByRole("alert")).toContainText("Only the organiser can access this poll");
  await expect(harness.page.getByLabel(/^Title(?:\s*\*)?$/)).toHaveValue("");
  assert.equal(harness.listRequests().length, 0);
});
