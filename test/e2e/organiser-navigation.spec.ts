import type { APIRequestContext, Page, Request } from "@playwright/test";
import { expect, test } from "./fixtures";

const validDraft = {
  title: "Organiser navigation dinner",
  timeZone: "Europe/London",
  proposedDates: [
    { kind: "date", localDate: "2026-10-10" },
    { kind: "date", localDate: "2026-10-17" }
  ]
};

function ownerHeaders(testRunId: string) {
  return { "x-local-organiser-id": `local-organiser-${testRunId}` };
}

async function seedPoll(
  request: APIRequestContext, testRunId: string, status: "draft" | "open" | "closed"
) {
  const headers = ownerHeaders(testRunId);
  const created = await request.post("/api/organiser/polls", { headers, data: validDraft });
  expect(created.status()).toBe(201);
  const poll = await created.json();
  let publicUrl = "";
  if (status !== "draft") {
    const published = await request.post(`/api/organiser/polls/${poll.id}/publish`, { headers });
    expect(published.status()).toBe(200);
    publicUrl = (await published.json()).publicUrl;
  }
  if (status === "closed") {
    const current = await request.get(`/api/organiser/polls/${poll.id}`, { headers });
    expect(current.status()).toBe(200);
    const openPoll = await current.json();
    const closed = await request.post(`/api/organiser/polls/${poll.id}/close`, {
      headers, data: { selectedDateId: openPoll.proposedDates[0].id, confirmed: true }
    });
    expect(closed.status()).toBe(200);
  }
  return { id: poll.id, publicUrl, headers };
}

async function snapshot(request: APIRequestContext, id: string, testRunId: string) {
  const headers = ownerHeaders(testRunId);
  const poll = await request.get(`/api/organiser/polls/${id}`, { headers });
  expect(poll.status()).toBe(200);
  const history = await request.get(`/api/organiser/polls/${id}/history`, { headers });
  expect(history.status()).toBe(200);
  return { poll: await poll.json(), history: await history.json() };
}

function observeApi(page: Page): Request[] {
  const requests: Request[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(request);
  });
  return requests;
}

function listResponse(page: Page) {
  return page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/organiser/polls" &&
    response.request().method() === "GET");
}

async function myPolls(page: Page, testRunId: string) {
  await expect(page.getByRole("heading", { name: "My polls", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create poll", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).not.toBeVisible();
  await expect(page).toHaveURL((url) => url.pathname === "/" &&
    url.searchParams.get("testRunId") === testRunId &&
    !url.searchParams.has("pollId") && !url.searchParams.has("view"));
}

async function returnToMyPolls(page: Page, testRunId: string) {
  const link = page.getByRole("link", { name: /^(?:←\s*)?My polls$/ });
  await expect(link).toBeVisible();
  const returned = listResponse(page);
  await link.click();
  const response = await returned;
  expect(response.status()).toBe(200);
  expect(response.request().headers()["x-local-organiser-id"]).toBe(ownerHeaders(testRunId)["x-local-organiser-id"]);
  const params = new URL(response.url()).searchParams;
  expect(params.get("filter")).toBe("active");
  expect(params.get("search")).toBe("");
  await myPolls(page, testRunId);
  await expect(page.getByRole("button", { name: "Active", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL((url) => (url.searchParams.get("filter") ?? "active") === "active" &&
    (url.searchParams.get("search") ?? "") === "");
}

async function management(page: Page, status: "open" | "closed") {
  await expect(page.getByRole("heading", { name: validDraft.title, exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Organiser controls" })).toBeVisible();
  await expect(page.getByTestId("public-state")).toHaveText(status === "closed" ? "Closed" : "Open");
  await expect(page.getByRole("heading", { name: "My polls", exact: true })).not.toBeVisible();
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).not.toBeVisible();
}

test("normal organiser landing loads Active My polls without changing the poll or audit count", async ({
  page, request, testRunId
}) => {
  const fixture = await seedPoll(request, testRunId, "draft");
  const before = await snapshot(request, fixture.id, testRunId);
  const requests = observeApi(page);
  const loaded = listResponse(page);
  await page.goto(`/?testRunId=${encodeURIComponent(testRunId)}`);
  const response = await loaded;
  expect(response.status()).toBe(200);
  expect(response.request().headers()["x-local-organiser-id"]).toBe(fixture.headers["x-local-organiser-id"]);
  expect(new URL(response.url()).searchParams.get("filter")).toBe("active");
  expect(new URL(response.url()).searchParams.get("search")).toBe("");
  await myPolls(page, testRunId);
  await expect(page.getByRole("button", { name: "Active", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(requests.every((request) => request.method() === "GET")).toBe(true);
  expect(await snapshot(request, fixture.id, testRunId)).toEqual(before);
});

for (const entry of ["active", "closed"] as const) {
  test(`Create poll from ${entry} opens the existing editor, saves a valid draft and returns to default Active`, async ({
    page, request, testRunId
  }) => {
    const fixture = await seedPoll(request, testRunId, "draft");
    const before = await snapshot(request, fixture.id, testRunId);
    const loaded = listResponse(page);
    await page.goto(`/?testRunId=${encodeURIComponent(testRunId)}&filter=${entry}&search=previous`);
    expect((await loaded).status()).toBe(200);
    await myPolls(page, testRunId);
    await page.getByRole("link", { name: "Create poll", exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/" &&
      url.searchParams.get("view") === "create" && !url.searchParams.has("pollId") &&
      url.searchParams.get("testRunId") === testRunId);
    await expect(page.getByRole("heading", { name: "New poll", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("");
    await expect(page.getByRole("textbox", { name: "Title", exact: true })).toBeEditable();
    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeVisible();
    expect(await snapshot(request, fixture.id, testRunId)).toEqual(before);

    await page.getByRole("textbox", { name: "Title", exact: true }).fill("New navigation draft");
    for (const date of ["2026-10-10", "2026-10-17"]) {
      await page.getByLabel("New proposed date").fill(date);
      await page.getByLabel("New proposed time").fill("");
      await page.getByRole("button", { name: "Add date", exact: true }).click();
    }
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByTestId("draft-form").getByRole("status")).toContainText("Draft saved");
    await expect(page).toHaveURL((url) => url.searchParams.get("view") === "editor" &&
      Boolean(url.searchParams.get("pollId")));
    const id = new URL(page.url()).searchParams.get("pollId")!;
    const saved = await snapshot(request, id, testRunId);
    expect(saved.poll).toMatchObject({ title: "New navigation draft", status: "draft" });
    expect(saved.poll.proposedDates).toHaveLength(2);
    expect(saved.history.total).toBe(1);

    await returnToMyPolls(page, testRunId);
    expect(await snapshot(request, id, testRunId)).toEqual(saved);
    expect(await snapshot(request, fixture.id, testRunId)).toEqual(before);
  });
}

// T-108/T-109 preserve both poll-ID deep links and existing organiser capability URLs.
for (const [status, route] of [
  ["draft", "id"], ["open", "id"], ["closed", "id"],
  ["open", "capability"], ["closed", "capability"]
] as const) {
  test(`direct ${status} organiser ${route} view has a working My polls return without audit changes`, async ({
    page, request, testRunId
  }) => {
    const fixture = await seedPoll(request, testRunId, status);
    const before = await snapshot(request, fixture.id, testRunId);
    const requests = observeApi(page);
    const destination = route === "id"
      ? `/?pollId=${fixture.id}&testRunId=${encodeURIComponent(testRunId)}`
      : `${fixture.publicUrl}?organiser=1&testRunId=${encodeURIComponent(testRunId)}`;
    await page.goto(destination);
    await expect(page).toHaveURL(new URL(destination, page.url()).href);
    if (status === "draft") {
      await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(validDraft.title);
      await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "My polls", exact: true })).not.toBeVisible();
    } else await management(page, status);
    expect(requests.filter((request) => new URL(request.url()).pathname === "/api/organiser/polls")).toHaveLength(0);
    expect(await snapshot(request, fixture.id, testRunId)).toEqual(before);
    await returnToMyPolls(page, testRunId);
    expect(requests.every((request) => request.method() === "GET")).toBe(true);
    expect(await snapshot(request, fixture.id, testRunId)).toEqual(before);
  });
}

test("publication stays on management with a current share link isolated from organiser access", async ({
  page, context, browser, request, testRunId
}) => {
  const fixture = await seedPoll(request, testRunId, "draft");
  const otherRunId = `${testRunId}-other`;
  const other = await seedPoll(request, otherRunId, "draft");
  const otherBefore = await snapshot(request, other.id, otherRunId);
  await page.goto(`/?pollId=${fixture.id}&testRunId=${encodeURIComponent(testRunId)}`);
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(validDraft.title);
  const published = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/organiser/polls/${fixture.id}/publish` &&
    response.request().method() === "POST");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const publication = await published;
  expect(publication.status()).toBe(200);
  const { publicUrl } = await publication.json();
  await management(page, "open");
  await expect(page).toHaveURL((url) => url.pathname === "/" &&
    url.searchParams.get("pollId") === fixture.id && url.searchParams.get("view") === "manage" &&
    url.searchParams.get("testRunId") === testRunId);
  await expect(page.getByLabel("Public poll link", { exact: true })).toHaveValue(publicUrl);
  expect(new URL(publicUrl).pathname).toMatch(/^\/p\/[A-Za-z0-9_-]{32}$/);
  const beforeNavigation = await snapshot(request, fixture.id, testRunId);
  expect(beforeNavigation.history.items[0].action).toBe("POLL_PUBLISHED");

  const publicContext = await browser.newContext();
  try {
    expect(publicContext).not.toBe(context);
    const publicPage = await publicContext.newPage();
    const publicRequests = observeApi(publicPage);
    await publicPage.goto(publicUrl);
    await expect(publicPage).toHaveURL(publicUrl);
    await expect(publicPage.getByRole("heading", { name: validDraft.title, exact: true })).toBeVisible();
    await expect(publicPage.getByRole("region", { name: "Organiser controls" })).not.toBeVisible();
    // A public capability takes precedence even over conflicting organiser route parameters.
    const directUrl = `${publicUrl}?pollId=${other.id}&view=history&testRunId=`;
    await publicPage.goto(directUrl);
    await expect(publicPage).toHaveURL(directUrl);
    await expect(publicPage.getByRole("heading", { name: validDraft.title, exact: true })).toBeVisible();
    await expect(publicPage.getByTestId("public-state")).toHaveText("Open");
    await expect(publicPage.getByText("No account needed", { exact: true })).toBeVisible();
    await expect(publicPage.getByRole("button", { name: "+ Add a row", exact: true })).toBeVisible();
    await expect(publicPage.getByRole("region", { name: "Organiser controls" })).not.toBeVisible();
    await expect(publicPage.getByRole("heading", { name: "My polls", exact: true })).not.toBeVisible();
    await expect(publicPage.getByRole("link", { name: /My polls|History/ })).not.toBeVisible();
    expect(publicRequests.length).toBeGreaterThan(0);
    expect(publicRequests.every((request) => new URL(request.url()).pathname.startsWith("/api/public/") &&
      request.method() === "GET" && !request.headers()["x-local-organiser-id"])).toBe(true);

    // Probe from the unauthenticated browser itself: possessing the issued capability
    // grants neither list access nor read/write access to either private organiser route.
    const token = new URL(publicUrl).pathname.split("/").at(-1)!;
    const denied = await publicPage.evaluate(async ({ token, id, otherId }) => {
      const results = [];
      for (const capabilityOnly of [false, true]) {
        for (const [method, path] of [
          ["GET", "/api/organiser/polls"],
          ["GET", `/api/organiser/polls/${id}`],
          ["GET", `/api/organiser/polls/${otherId}`],
          ["PUT", `/api/organiser/polls/${otherId}`]
        ]) {
          const response = await fetch(path!, {
            method, headers: { "content-type": "application/json",
              ...(capabilityOnly ? { authorization: `Bearer ${token}`, "x-public-link-token": token } : {}) },
            ...(method === "PUT" ? { body: JSON.stringify({ title: "Forbidden edit" }) } : {})
          });
          results.push({ status: response.status, body: await response.json() });
        }
      }
      return results;
    }, { token, id: fixture.id, otherId: other.id });
    expect(denied).toHaveLength(8);
    for (const result of denied) {
      expect(result.status).toBe(401);
      expect(result.body.error.code).toBe("UNAUTHENTICATED");
      expect(JSON.stringify(result.body)).not.toContain(validDraft.title);
      expect(JSON.stringify(result.body)).not.toContain(fixture.id);
      expect(JSON.stringify(result.body)).not.toContain(other.id);
    }

    for (const method of ["GET", "PUT"]) {
      const deniedOther = await context.request.fetch(`/api/organiser/polls/${other.id}`, {
        method, headers: fixture.headers,
        ...(method === "PUT" ? { data: { ...validDraft, title: "Forbidden edit" } } : {})
      });
      expect(deniedOther.status()).toBe(403);
      expect((await deniedOther.json()).error.code).toBe("FORBIDDEN");
    }
    await management(page, "open");
    await expect(page.getByLabel("Public poll link", { exact: true })).toHaveValue(publicUrl);
    expect(await snapshot(request, fixture.id, testRunId)).toEqual(beforeNavigation);
    expect(await snapshot(request, other.id, otherRunId)).toEqual(otherBefore);
    await returnToMyPolls(page, testRunId);
    expect(await snapshot(request, fixture.id, testRunId)).toEqual(beforeNavigation);
  } finally {
    await publicContext.close();
  }
});
