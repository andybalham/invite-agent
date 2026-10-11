import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";

async function snapshot(request: APIRequestContext, id: string, headers: Record<string, string>) {
  const poll = await request.get(`/api/organiser/polls/${id}`, { headers });
  const history = await request.get(`/api/organiser/polls/${id}/history`, { headers });
  expect(poll.status()).toBe(200);
  expect(history.status()).toBe(200);
  return { poll: await poll.json(), history: await history.json() };
}

for (const [layout, viewport] of [
  ["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]
] as const) {
  test.describe(`T-151 share recovery on ${layout}`, () => {
    test.use({ viewport });
    test("publish, recover, copy/open, rotate, close and reopen preserve collaboration", async ({
      page, request, testRunId
    }) => {
      test.setTimeout(90_000);
      const title = "Share recovery dinner";
      const runId = `${testRunId}-${layout}`;
      const headers = { "x-local-organiser-id": `local-organiser-${runId}` };
      const landing = `/?testRunId=${encodeURIComponent(runId)}`;
      await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: {
        writeText: async (text: string) => { (window as Window & { copiedText?: string }).copiedText = text; }
      } }));
      // Creation/publication use the browser; fixtures do not manufacture a capability.
      await page.goto(landing);
      await page.getByRole("link", { name: "Create poll", exact: true }).click();
      await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
      for (const date of ["2026-10-10", "2026-10-17"]) {
        await page.getByLabel("New proposed date").fill(date);
        await page.getByLabel("New proposed time").fill("");
        await page.getByRole("button", { name: "Add date", exact: true }).click();
      }
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      await expect(page.getByTestId("draft-form").getByRole("status")).toHaveText("Draft saved.");
      const id = new URL(page.url()).searchParams.get("pollId")!;
      const sharePath = `/api/organiser/polls/${id}/share-link`;
      const shareRequests: { method: string; path: string }[] = [];
      page.on("request", (request) => {
        const path = new URL(request.url()).pathname;
        if (path.startsWith(sharePath)) shareRequests.push({ method: request.method(), path });
      });
      const returnLink = () => page.getByRole("link", { name: /^(?:←\s*)?My polls$/ });
      const surface = () => page.locator(`.my-polls-${layout}`);
      const trigger = () => surface().getByRole("link", { name: title, exact: true });
      const panel = () => page.getByRole("region", { name: "Share poll", exact: true });
      await returnLink().click();
      await expect(surface().getByRole("link", { name: title, exact: true })).toBeVisible();
      await expect(panel()).toHaveCount(0);
      expect(shareRequests).toEqual([]);
      await surface().getByRole("link", { name: title, exact: true }).click();
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      const publication = panel();
      await expect(publication).toBeVisible();
      const originalUrl = await publication.getByLabel("Public poll link", { exact: true }).inputValue();
      expect(originalUrl).toMatch(/\/p\/[A-Za-z0-9_-]{32}$/);
      const originalToken = new URL(originalUrl).pathname.split("/").at(-1)!;
      const added = await request.post(`/api/public/polls/${originalToken}/participants`, { data: { displayName: "Alice" } });
      expect(added.status()).toBe(201);
      const before = await snapshot(request, id, headers);

      // A new document discards the publication URL; the owner poll page retrieves it.
      await page.goto(`${landing}&filter=open&search=Share`);
      await expect(trigger()).toBeVisible();
      expect(shareRequests).toEqual([]);
      await expect(panel()).toHaveCount(0);
      const recovered = page.waitForResponse((response) => new URL(response.url()).pathname === sharePath);
      await trigger().click();
      const response = await recovered;
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toBe("private, no-store");
      expect(response.request().headers()["x-local-organiser-id"]).toBe(headers["x-local-organiser-id"]);
      expect(response.request().postData()).toBeNull();
      expect(new URL(response.url()).search).toBe("");
      await expect(panel().getByLabel("Public poll link", { exact: true })).toHaveValue(originalUrl);
      expect(new URL(page.url()).searchParams.get("pollId")).toBe(id);
      expect(new URL(page.url()).searchParams.get("returnSearch")).toBe("Share");
      await panel().getByRole("button", { name: "Copy link", exact: true }).click();
      await expect(panel().getByRole("status")).toHaveText("Public poll link copied.");
      expect(await page.evaluate(() => (window as Window & { copiedText?: string }).copiedText)).toBe(originalUrl);
      const open = panel().getByRole("link", { name: "Open as a participant", exact: true });
      await expect(open).toHaveAttribute("rel", "noopener noreferrer");
      const popupPromise = page.waitForEvent("popup");
      await open.click();
      const publicPage = await popupPromise;
      try {
        await expect(publicPage).toHaveURL(originalUrl);
        await expect(publicPage.getByRole("rowheader", { name: "Alice", exact: true })).toBeVisible();
        await expect(publicPage.getByRole("region", { name: "Organiser controls" })).toHaveCount(0);
        expect(await snapshot(request, id, headers)).toEqual(before);

        const regenerate = () => panel().getByRole("button", { name: "Regenerate link", exact: true });
        const dialog = () => page.getByRole("dialog", { name: "Regenerate public link", exact: true });
        await regenerate().click();
        await expect(dialog()).toContainText("The current link will stop working immediately.");
        await expect(dialog()).toContainText("Anyone using it will need the new link.");
        await dialog().getByRole("button", { name: "Cancel", exact: true }).click();
        await regenerate().click();
        await page.keyboard.press("Escape");
        await expect(dialog()).not.toBeVisible();
        expect(shareRequests.filter(({ method }) => method === "POST")).toEqual([]);
        expect(await snapshot(request, id, headers)).toEqual(before);
        await regenerate().click();
        await dialog().getByRole("button", { name: "Regenerate link", exact: true }).click();
        await expect(panel().getByRole("status")).toContainText("The old link no longer works.");
        const replacement = await panel().getByLabel("Public poll link", { exact: true }).inputValue();
        expect(replacement).not.toBe(originalUrl);
        expect(shareRequests.filter(({ method }) => method === "POST")).toEqual([{ method: "POST", path: `${sharePath}/rotate` }]);
        const rotated = await snapshot(request, id, headers);
        expect({ ...rotated.poll, version: before.poll.version }).toEqual(before.poll);
        expect(rotated.poll.version).toBe(before.poll.version + 1);
        expect(rotated.history.total).toBe(before.history.total + 1);
        expect(rotated.history.items[0].action).toBe("public_link.rotated");
        for (const url of [originalUrl, replacement]) {
          expect(JSON.stringify(rotated.history)).not.toContain(new URL(url).pathname.split("/").at(-1)!);
        }
        const revoked = await request.get(`/api/public/polls/${originalToken}`);
        expect(revoked.status()).toBe(410);
        expect((await revoked.json()).error.code).toBe("LINK_REVOKED");
        const deniedWrite = await request.post(`/api/public/polls/${originalToken}/participants`, { data: { displayName: "Rejected" } });
        expect(deniedWrite.status()).toBe(410);
        await publicPage.goto(replacement);
        await expect(publicPage.getByRole("rowheader", { name: "Alice", exact: true })).toBeVisible();
        await expect(publicPage.getByRole("button", { name: "+ Add a row", exact: true })).toBeVisible();

        // Rotation leaves existing lifecycle controls and the collaboration data intact.
        await page.locator("button[data-close-choice-id]").first().click();
        await page.getByRole("dialog", { name: "Final date", exact: true })
          .getByRole("button", { name: "Confirm & close poll", exact: true }).click();
        await expect(page.getByTestId("public-state")).toHaveText("Closed");
        await returnLink().click();
        await page.getByRole("button", { name: "Closed", exact: true }).click();
        await trigger().click();
        await expect(panel().getByLabel("Public poll link", { exact: true })).toHaveValue(replacement);
        await publicPage.reload();
        await expect(publicPage.getByText("This poll is closed. Responses are read-only.", { exact: true })).toBeVisible();
        await expect(publicPage.getByRole("rowheader", { name: "Alice", exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Reopen poll…", exact: true }).click();
        await page.getByRole("dialog", { name: "Reopen this poll?", exact: true })
          .getByRole("button", { name: "Reopen poll", exact: true }).click();
        await expect(page.getByTestId("public-state")).toHaveText("Open");
        await publicPage.reload();
        await expect(publicPage.getByRole("button", { name: "+ Add a row", exact: true })).toBeVisible();
        await expect(publicPage.getByRole("rowheader", { name: "Alice", exact: true })).toBeVisible();
        const final = await snapshot(request, id, headers);
        expect(final.poll.proposedDates).toEqual(before.poll.proposedDates);
        expect(final.poll.participants).toEqual(before.poll.participants);
        expect(final.history.total).toBe(rotated.history.total + 2);
      } finally { await publicPage.close(); }
    });
  });
}
