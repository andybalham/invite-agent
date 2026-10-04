import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// T-111: these checks use the real local server, not the component auth fixture.
// Simulated identities establish no production Cognito acceptance evidence.
for (const status of ["draft", "open", "closed"] as const) {
  test(`direct ${status} management rejects a different local owner without redirects or mutations`, async ({
    page, request, testRunId
  }) => {
    const headers = { "x-local-organiser-id": `local-organiser-${testRunId}` };
    const created = await request.post("/api/organiser/polls", {
      headers, data: {
        title: "Private navigation guard poll", timeZone: "Europe/London",
        proposedDates: [
          { kind: "date", localDate: "2026-10-10" },
          { kind: "date", localDate: "2026-10-17" }
        ]
      }
    });
    expect(created.status()).toBe(201);
    const { id } = await created.json();
    const path = `/api/organiser/polls/${id}`;
    if (status !== "draft") {
      expect((await request.post(`${path}/publish`, { headers })).status()).toBe(200);
    }
    if (status === "closed") {
      const current = await request.get(path, { headers });
      const poll = await current.json();
      expect((await request.post(`${path}/close`, {
        headers, data: { selectedDateId: poll.proposedDates[0].id, confirmed: true }
      })).status()).toBe(200);
    }
    const snapshot = async () => {
      const poll = await request.get(path, { headers });
      const history = await request.get(`${path}/history`, { headers });
      expect(poll.status()).toBe(200);
      expect(history.status()).toBe(200);
      return { poll: await poll.json(), history: await history.json() };
    };
    const before = await snapshot();
    const apiRequests: { method: string; path: string }[] = [];
    const documents: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.startsWith("/api/")) apiRequests.push({ method: request.method(), path: pathname });
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(request.url());
    });
    const destination = `/?pollId=${id}&testRunId=${encodeURIComponent(testRunId)}-other`;
    const denied = page.waitForResponse((response) => new URL(response.url()).pathname === path);
    await page.goto(destination);
    const response = await denied;
    expect(response.status()).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
    expect(response.request().headers()["x-local-organiser-id"]).toBe(`${headers["x-local-organiser-id"]}-other`);
    await expect(page.getByTestId("draft-form").getByRole("alert")).toContainText("The organiser does not own this poll");
    await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("");
    await expect(page.getByRole("region", { name: "Organiser controls" })).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "My polls", exact: true })).not.toBeVisible();
    await expect(page).toHaveURL(new URL(destination, page.url()).href);
    // Reload repeats the same server denial rather than redirecting into a loop.
    const reloadDenied = page.waitForResponse((response) => new URL(response.url()).pathname === path);
    await page.reload();
    expect((await reloadDenied).status()).toBe(403);
    await expect(page.getByTestId("draft-form").getByRole("alert")).toContainText("The organiser does not own this poll");
    expect(documents).toEqual([page.url(), page.url()]);
    expect(apiRequests).toEqual([{ method: "GET", path }, { method: "GET", path }]);
    expect(await snapshot()).toEqual(before);
  });
}

test("empty local identity stays at the authentication boundary without a navigation loop", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(request.method());
  });
  const response = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/organiser/polls");
  await page.goto("/?testRunId=");
  expect((await response).status()).toBe(401);
  await expect(page.getByText("Sign in to view your polls.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL((url) => url.pathname === "/" && url.searchParams.get("testRunId") === "");
  expect(requests).toEqual(["GET"]);
});

test("a fresh public context keeps a Closed poll read-only through reload with useful failure traces", async ({
  browser, request, testRunId
}, testInfo) => {
  const headers = { "x-local-organiser-id": `local-organiser-${testRunId}` };
  const created = await request.post("/api/organiser/polls", {
    headers, data: {
      title: "Closed public navigation", timeZone: "Europe/London",
      proposedDates: [
        { kind: "date", localDate: "2026-10-10" },
        { kind: "date", localDate: "2026-10-17" }
      ]
    }
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  const path = `/api/organiser/polls/${id}`;
  const publication = await request.post(`${path}/publish`, { headers });
  expect(publication.status()).toBe(200);
  const { publicUrl } = await publication.json();
  const published = await request.get(path, { headers });
  expect(published.status()).toBe(200);
  const poll = await published.json();
  expect((await request.post(`${path}/close`, {
    headers, data: { selectedDateId: poll.proposedDates[0].id, confirmed: true }
  })).status()).toBe(200);
  const before = await request.get(`${path}/history`, { headers });
  expect(before.status()).toBe(200);
  const history = await before.json();
  const publicContext = await browser.newContext();
  // The runner's retain-on-failure trace includes browser.newContext() pages.
  let publicPage: Page | undefined;
  const apiLog: string[] = [];
  let passed = false;
  try {
    publicPage = await publicContext.newPage();
    const requests: { method: string; path: string; owner?: string }[] = [];
    const documents: string[] = [];
    publicPage.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.startsWith("/api/")) requests.push({
        method: request.method(), path: pathname, owner: request.headers()["x-local-organiser-id"]
      });
      if (request.isNavigationRequest() && request.frame() === publicPage!.mainFrame()) documents.push(request.url());
    });
    publicPage.on("response", (response) => {
      const pathname = new URL(response.url()).pathname;
      if (pathname.startsWith("/api/")) apiLog.push(`${response.status()} ${response.request().method()} ${pathname.replace(/(\/api\/public\/polls\/)[^/]+/, "$1[REDACTED]")}`);
    });
    await publicPage.goto(publicUrl);
    await expect(publicPage.getByTestId("public-state")).toHaveText("Closed");
    const current = await publicContext.request.get(new URL(requests[0].path, publicUrl).href);
    expect(current.status()).toBe(200);
    const beforePoll = await current.json();
    await publicPage.reload();
    await expect(publicPage.getByRole("heading", { name: "Closed public navigation", exact: true })).toBeVisible();
    await expect(publicPage.getByTestId("public-state")).toHaveText("Closed");
    await expect(publicPage.getByRole("button", { name: "+ Add a row", exact: true })).not.toBeVisible();
    await expect(publicPage.getByRole("region", { name: "Organiser controls" })).not.toBeVisible();
    await expect(publicPage.getByRole("heading", { name: "My polls", exact: true })).not.toBeVisible();
    await expect(publicPage).toHaveURL(publicUrl);
    expect(documents).toEqual([publicUrl, publicUrl]);
    expect(requests.length).toBeGreaterThanOrEqual(2);
    expect(requests.every(({ method, path, owner }) => method === "GET" && path.startsWith("/api/public/") && !owner)).toBe(true);
    const afterPoll = await publicContext.request.get(current.url());
    expect(afterPoll.status()).toBe(200);
    expect(await afterPoll.json()).toEqual(beforePoll);
    const after = await request.get(`${path}/history`, { headers });
    expect(after.status()).toBe(200);
    expect(await after.json()).toEqual(history);
    passed = true;
  } finally {
    try {
      if (!passed) {
        await testInfo.attach("public-api.log", { body: apiLog.join("\n"), contentType: "text/plain" });
        if (publicPage) await testInfo.attach("public-screenshot", {
          body: await publicPage.screenshot(), contentType: "image/png"
        });
      }
    } finally { await publicContext.close(); }
  }
});
