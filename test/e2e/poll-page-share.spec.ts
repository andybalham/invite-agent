import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const share = (page: Page) => page.getByRole("region", { name: "Share poll", exact: true });

function noSecrets(value: unknown, tokens: string[] = []) {
  const serialized = JSON.stringify(value);
  for (const field of ["publicToken", "publicTokenHash", "encryptedPublicToken", "publicUrl", "ciphertext", "authTag", "iv", "keyId"]) {
    expect(serialized).not.toContain(`"${field}"`);
  }
  for (const token of tokens) expect(serialized).not.toContain(token);
}

for (const state of ["draft", "open", "closed"] as const) {
  test(`T-166 ${state}: other owners and capability-only holders cannot retrieve or rotate links`, async ({ page, request, testRunId }) => {
    const headers = { "x-local-organiser-id": `local-organiser-${testRunId}` };
    const created = await request.post("/api/organiser/polls", { headers, data: {
      title: "Private canonical sharing", timeZone: "Europe/London",
      proposedDates: [{ kind: "date", localDate: "2026-11-10" }, { kind: "date", localDate: "2026-11-11" }]
    } });
    expect(created.status()).toBe(201);
    const { id } = await created.json();
    const path = `/api/organiser/polls/${id}`;
    let publicUrl: string | undefined;
    if (state !== "draft") {
      const published = await request.post(`${path}/publish`, { headers });
      expect(published.status()).toBe(200);
      publicUrl = (await published.json()).publicUrl;
    }
    if (state === "closed") {
      const current = await snapshot(request, path, headers);
      expect((await request.post(`${path}/close`, { headers,
        data: { selectedDateId: current.poll.proposedDates[0].id, confirmed: true }
      })).status()).toBe(200);
    }
    const before = await snapshot(request, path, headers);
    const token = publicUrl ? new URL(publicUrl).pathname.split("/").at(-1)! : "a".repeat(32);
    const shareRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith(`${path}/share-link`)) shareRequests.push(request.method());
    });
    const denial = page.waitForResponse((response) => new URL(response.url()).pathname === path);
    await page.goto(`/?view=manage&pollId=${id}&testRunId=${encodeURIComponent(testRunId)}-other`);
    const denied = await denial;
    expect(denied.status()).toBe(403);
    noSecrets(await denied.json(), [token]);
    await expect(page.getByRole("alert").filter({ hasText: "The organiser does not own this poll" })).toBeVisible();
    await expect(share(page)).not.toBeVisible();
    await expect(page.getByLabel("Public poll link", { exact: true })).not.toBeVisible();
    await expect(page.getByRole("region", { name: "Organiser controls" })).not.toBeVisible();
    expect(shareRequests).toEqual([]);

    // Real HTTP checks enforce the boundary even if a caller bypasses hidden controls.
    for (const [method, suffix] of [["GET", "/share-link"], ["POST", "/share-link/rotate"]] as const) {
      for (const [identity, status, code] of [
        [{}, 401, "UNAUTHENTICATED"],
        [{ authorization: `Bearer ${token}`, "x-public-link-token": token }, 401, "UNAUTHENTICATED"],
        [{ "x-local-organiser-id": `${headers["x-local-organiser-id"]}-other` }, 403, "FORBIDDEN"]
      ] as const) {
        const response = await request.fetch(`${path}${suffix}`, { method, headers: identity });
        expect(response.status()).toBe(status);
        expect(response.headers()["cache-control"]).toBe("private, no-store");
        const body = await response.json();
        expect(body.error.code).toBe(code);
        noSecrets(body, [token]);
      }
      if (state === "draft") {
        const response = await request.fetch(`${path}${suffix}`, { method, headers });
        expect(response.status()).toBe(422);
        const body = await response.json();
        expect(body.error.code).toBe("INVALID_LIFECYCLE");
        noSecrets(body);
      }
    }
    for (const filter of ["active", state] as const) {
      const response = await request.get(`/api/organiser/polls?filter=${filter}`, { headers });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.items.some((poll: { id: string }) => poll.id === id)).toBe(filter === state || state !== "closed");
      noSecrets(body, [token]);
    }
    noSecrets(before, [token]);
    expect(await snapshot(request, path, headers)).toEqual(before);
    if (publicUrl) {
      const recovered = await request.get(`${path}/share-link`, { headers });
      expect(recovered.status()).toBe(200);
      expect(recovered.headers()["cache-control"]).toBe("private, no-store");
      expect(await recovered.json()).toEqual({ publicUrl });
    }
  });
}

async function noOwnerControls(page: Page) {
  await expect(share(page)).not.toBeVisible();
  await expect(page.getByLabel("Public poll link", { exact: true })).not.toBeVisible();
  await expect(page.getByRole("region", { name: "Organiser controls" })).not.toBeVisible();
  await expect(page.getByRole("link", { name: /^(?:History|Edit poll|Edit dates|Open as a participant)$/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(?:Copy link|Regenerate link|Edit poll|Edit dates|Edit location|Reopen poll.*|Close poll.*|Confirm & close poll)$/ })).toHaveCount(0);
  await expect(page.locator("button[data-close-choice-id]")).toHaveCount(0);
}

async function copyAndOpen(page: Page, publicUrl: string, state: "Open" | "Closed") {
  await share(page).getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(share(page).getByRole("status")).toHaveText("Public poll link copied.");
  expect(await page.evaluate(() => (window as Window & { copiedText?: string }).copiedText)).toBe(publicUrl);
  const open = share(page).getByRole("link", { name: "Open as a participant", exact: true });
  await expect(open).toHaveAttribute("href", publicUrl);
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(open).toHaveAttribute("rel", "noopener noreferrer");
  const popupPromise = page.waitForEvent("popup");
  await open.click();
  const popup = await popupPromise;
  try {
    await expect(popup).toHaveURL(publicUrl);
    await expect(popup.getByTestId("public-state")).toHaveText(state);
    await expect(popup.getByRole("rowheader", { name: "Alice", exact: true })).toBeVisible();
    await noOwnerControls(popup);
    if (state === "Closed") {
      await expect(popup.getByText("This poll is closed. Responses are read-only.", { exact: true })).toBeVisible();
      await expect(popup.getByRole("button", { name: /Add a row|Actions for|^Alice,/ })).toHaveCount(0);
    }
  } finally { await popup.close(); }
}

async function snapshot(request: APIRequestContext, path: string, headers: Record<string, string>) {
  const poll = await request.get(path, { headers });
  const history = await request.get(`${path}/history`, { headers });
  expect(poll.status()).toBe(200);
  expect(history.status()).toBe(200);
  return { poll: await poll.json(), history: await history.json() };
}

// S-060 / T-164–166: real browser/API acceptance of canonical owner-page sharing.
for (const [layout, viewport] of [
  ["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]
] as const) {
    test.describe(`T-166 canonical poll sharing on ${layout}`, () => {
    test.use({ viewport });
    test("publication, current-link recovery, copy/open and confirmed rotation stay on the poll page", async ({
      page, request, browser, testRunId
    }) => {
      test.setTimeout(90_000);
      const headers = { "x-local-organiser-id": `local-organiser-${testRunId}` };
      const title = "Canonical public-link dinner";
      await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: {
        writeText: async (text: string) => { (window as Window & { copiedText?: string }).copiedText = text; }
      } }));
      const requests: { method: string; path: string }[] = [];
      page.on("request", (request) => {
        const path = new URL(request.url()).pathname;
        if (path.includes("/share-link")) requests.push({ method: request.method(), path });
      });
      await page.goto(`/?view=create&testRunId=${encodeURIComponent(testRunId)}`);
      await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
      for (const date of ["2026-11-10", "2026-11-11"]) {
        await page.getByLabel("New proposed date").fill(date);
        await page.getByLabel("New proposed time").fill("");
        await page.getByRole("button", { name: "Add date", exact: true }).click();
      }
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      await expect(page.getByTestId("draft-form").getByRole("status")).toHaveText("Draft saved.");
      const id = new URL(page.url()).searchParams.get("pollId")!;
      const path = `/api/organiser/polls/${id}`;
      await expect(share(page)).not.toBeVisible();
      await expect(page.getByRole("button", { name: /^(?:Copy link|Regenerate link)$/ })).toHaveCount(0);
      expect(requests).toEqual([]);
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: "Organiser controls" })).toBeVisible();
      await expect(share(page)).toBeVisible();
      await expect(page).toHaveURL((url) => url.searchParams.get("pollId") === id && !["editor", "create"].includes(url.searchParams.get("view") ?? ""));
      await expect(share(page).getByRole("status")).toContainText(/(?:ready|published)/i);
      expect(await page.evaluate(() => document.activeElement?.closest('[aria-label="Share poll"]') !== null || document.activeElement?.matches("h1") === true)).toBe(true);
      const original = await share(page).getByLabel("Public poll link", { exact: true }).inputValue();
      expect(original).toMatch(/\/p\/[A-Za-z0-9_-]{32}$/);
      const oldToken = new URL(original).pathname.split("/").at(-1)!;
      const added = await request.post(`/api/public/polls/${oldToken}/participants`, { data: { displayName: "Alice" } });
      expect(added.status()).toBe(201);
      const collaboration = await added.json();
      expect((await request.put(`/api/public/polls/${oldToken}/participants/${collaboration.participants[0].id}`, {
        data: { dateId: collaboration.proposedDates[0].id, availability: "yes" }
      })).status()).toBe(200);
      const before = await snapshot(request, path, headers);
      await page.goto(`/?testRunId=${encodeURIComponent(testRunId)}&filter=open`);
      await expect(page.getByRole("region", { name: /^(?:Share poll|Share link for .*)$/, includeHidden: true })).toHaveCount(0);
      await page.locator(`.my-polls-${layout}`).getByRole("link", { name: title, exact: true }).click();
      await expect(share(page).getByLabel("Public poll link", { exact: true })).toHaveValue(original);
      const recovery = page.waitForResponse((response) => new URL(response.url()).pathname === `${path}/share-link`);
      await page.reload();
      const recovered = await recovery;
      expect(recovered.status()).toBe(200);
      expect(recovered.headers()["cache-control"]).toBe("private, no-store");
      expect(recovered.request().headers()["x-local-organiser-id"]).toBe(headers["x-local-organiser-id"]);
      expect(recovered.request().postData()).toBeNull();
      expect(new URL(recovered.url()).search).toBe("");
      expect(await recovered.json()).toEqual({ publicUrl: original });
      await expect(share(page).getByLabel("Public poll link", { exact: true })).toHaveValue(original);
      expect(requests.some(({ method, path: route }) => method === "GET" && route === `${path}/share-link`)).toBe(true);
      await copyAndOpen(page, original, "Open");
      expect(await snapshot(request, path, headers)).toEqual(before);
      const regenerate = share(page).getByRole("button", { name: "Regenerate link", exact: true });
      const dialog = page.getByRole("dialog", { name: "Regenerate public link", exact: true });
      await regenerate.click();
      await expect(dialog).toContainText("The current link will stop working immediately.");
      await expect(dialog).toContainText("Anyone using it will need the new link.");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await regenerate.click();
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      expect(requests.filter(({ method }) => method === "POST")).toEqual([]);
      expect(await snapshot(request, path, headers)).toEqual(before);
      await regenerate.click();
      await dialog.getByRole("button", { name: "Regenerate link", exact: true }).click();
      await expect(share(page).getByRole("status")).toContainText("The old link no longer works.");
      const replacement = await share(page).getByLabel("Public poll link", { exact: true }).inputValue();
      expect(replacement).not.toBe(original);
      expect(requests.filter(({ method }) => method === "POST")).toEqual([{ method: "POST", path: `${path}/share-link/rotate` }]);
      const after = await snapshot(request, path, headers);
      expect({ ...after.poll, version: before.poll.version }).toEqual(before.poll);
      expect(after.poll.version).toBe(before.poll.version + 1);
      expect(after.history.items.slice(1)).toEqual(before.history.items);
      expect(after.history.items[0].action).toBe("public_link.rotated");
      expect(after.history.total).toBe(before.history.total + 1);
      const replacementToken = new URL(replacement).pathname.split("/").at(-1)!;
      noSecrets(after, [oldToken, replacementToken]);
      for (const [method, suffix, data] of [["GET", "", undefined], ["POST", "/participants", { displayName: "Rejected" }],
        ["PUT", `/participants/${before.poll.participants[0].id}`, { dateId: before.poll.proposedDates[0].id, availability: "no" }]] as const) {
        const revoked = await request.fetch(`/api/public/polls/${oldToken}${suffix}`, { method, ...(data ? { data } : {}) });
        expect(revoked.status()).toBe(410);
        expect((await revoked.json()).error.code).toBe("LINK_REVOKED");
      }
      // A separate context establishes the unauthenticated link-holder boundary.
      const publicContext = await browser.newContext({ extraHTTPHeaders: { "x-local-e2e-instance": process.env.E2E_API_INSTANCE_ID! } });
      try {
        const publicPage = await publicContext.newPage();
        // The bare capability URL establishes a link holder without simulated owner context.
        await publicPage.goto(replacement);
        await expect(publicPage.getByRole("rowheader", { name: "Alice", exact: true })).toBeVisible();
        await noOwnerControls(publicPage);
        const current = await request.get(`/api/public/polls/${replacementToken}`);
        expect(current.status()).toBe(200);
        noSecrets(await current.json(), [oldToken, replacementToken]);
        await page.locator("button[data-close-choice-id]").first().click();
        await page.getByRole("dialog", { name: "Final date", exact: true }).getByRole("button", { name: "Confirm & close poll", exact: true }).click();
        await expect(page.getByTestId("public-state")).toHaveText("Closed");
        await page.reload();
        await expect(share(page).getByLabel("Public poll link", { exact: true })).toHaveValue(replacement);
        const closedBefore = await snapshot(request, path, headers);
        expect(closedBefore.poll.selectedDateId).toBeTruthy();
        expect(closedBefore.poll.ranking.length).toBeGreaterThan(0);
        await copyAndOpen(page, replacement, "Closed");
        expect(await snapshot(request, path, headers)).toEqual(closedBefore);
        await publicPage.reload();
        await expect(publicPage.getByText("This poll is closed. Responses are read-only.", { exact: true })).toBeVisible();
        await noOwnerControls(publicPage);

        // Closed polls retain their final selection and frozen results across rotation.
        await regenerate.click();
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
        expect(requests.filter(({ method }) => method === "POST")).toHaveLength(1);
        expect(await snapshot(request, path, headers)).toEqual(closedBefore);
        await regenerate.click();
        await expect(dialog).toContainText("The current link will stop working immediately.");
        await dialog.getByRole("button", { name: "Regenerate link", exact: true }).click();
        await expect(share(page).getByRole("status")).toContainText("The old link no longer works.");
        const closedUrl = await share(page).getByLabel("Public poll link", { exact: true }).inputValue();
        expect(closedUrl).not.toBe(replacement);
        expect(requests.filter(({ method }) => method === "POST")).toEqual([
          { method: "POST", path: `${path}/share-link/rotate` },
          { method: "POST", path: `${path}/share-link/rotate` }
        ]);
        const closedAfter = await snapshot(request, path, headers);
        expect({ ...closedAfter.poll, version: closedBefore.poll.version }).toEqual(closedBefore.poll);
        expect(closedAfter.poll.version).toBe(closedBefore.poll.version + 1);
        expect(closedAfter.history.items.slice(1)).toEqual(closedBefore.history.items);
        expect(closedAfter.history.total).toBe(closedBefore.history.total + 1);
        expect(closedAfter.history.items[0].action).toBe("public_link.rotated");
        noSecrets(closedAfter, [oldToken, replacementToken, new URL(closedUrl).pathname.split("/").at(-1)!]);
        const revoked = await request.get(`/api/public/polls/${replacementToken}`);
        expect(revoked.status()).toBe(410);
        expect((await revoked.json()).error.code).toBe("LINK_REVOKED");
        const deniedWrite = await request.put(`/api/public/polls/${replacementToken}/participants/${before.poll.participants[0].id}`, {
          data: { dateId: before.poll.proposedDates[0].id, availability: "no" }
        });
        expect(deniedWrite.status()).toBe(410);
        expect((await deniedWrite.json()).error.code).toBe("LINK_REVOKED");
        await publicPage.goto(closedUrl);
        await expect(publicPage.getByTestId("public-state")).toHaveText("Closed");
        await expect(publicPage.getByRole("rowheader", { name: "Alice", exact: true })).toBeVisible();
        await noOwnerControls(publicPage);
        await page.reload();
        await expect(share(page).getByLabel("Public poll link", { exact: true })).toHaveValue(closedUrl);
        await copyAndOpen(page, closedUrl, "Closed");
        expect(await snapshot(request, path, headers)).toEqual(closedAfter);
      } finally { await publicContext.close(); }
    });
  });
}
