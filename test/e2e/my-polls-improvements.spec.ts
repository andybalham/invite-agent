import type { APIRequestContext, Page, Request } from "@playwright/test";
import type { OwnedPollListResponse, PublicPollResponse } from "@invite-a-gent/contracts";
import type { PollResponse } from "../../backend/src/application/poll-service";
import { compactSummary, dateLabels } from "../support/compact-date-fixture.mjs";
import { expect, test } from "./fixtures";

const searchField = (page: Page) => page.getByRole("searchbox", { name: "Search poll titles", exact: true });
const filterButton = (page: Page, name: string) => page.getByRole("group", { name: "Poll lifecycle" })
  .getByRole("button", { name, exact: true });
const listResponse = (page: Page) => page.waitForResponse((response) =>
  new URL(response.url()).pathname === "/api/organiser/polls" && response.request().method() === "GET");

async function snapshot(request: APIRequestContext, id: string, headers: Record<string, string>) {
  const path = `/api/organiser/polls/${id}`;
  const poll = await request.get(path, { headers });
  const history = await request.get(`${path}/history`, { headers });
  expect(poll.status()).toBe(200);
  expect(history.status()).toBe(200);
  return { poll: await poll.json(), history: await history.json() };
}

for (const [layout, viewport] of [
  ["desktop", { width: 1280, height: 900 }], ["mobile", { width: 320, height: 844 }]
] as const) {
  test.describe(`T-167 integrated My polls improvements on ${layout}`, () => {
    test.use({ viewport, timezoneId: "America/Los_Angeles" });
    test("loaded feedback, debounced discovery and date disclosure navigate independently of sharing", async ({
      page, request, testRunId, e2eConfiguration
    }) => {
      test.setTimeout(60_000);
      expect(e2eConfiguration.mode, "acceptance data must be disposable").toBe("isolated");
      const runId = `${testRunId}-${layout}`;
      const headers = { "x-local-organiser-id": `local-organiser-${runId}` };
      const polls: { id: string; title: string; status: "draft" | "open" | "closed"; count: number }[] = [];
      await test.step("seed mixed lifecycles and date sets through the real API", async () => {
        for (const [status, count] of [["draft", 4], ["open", 9], ["closed", 20]] as const) {
          const fixture = compactSummary(count, { status });
          const created = await request.post("/api/organiser/polls", { headers, data: {
            title: fixture.title, timeZone: fixture.timeZone, proposedDates: fixture.proposedDates
          } });
          expect(created.status(), `${status} fixture creation`).toBe(201);
          const draft: PollResponse = await created.json();
          const path = `/api/organiser/polls/${draft.id}`;
          if (status !== "draft") expect((await request.post(`${path}/publish`, { headers })).status()).toBe(200);
          if (status === "closed") {
            // Draft responses contain saved choices; the open view supplies their IDs.
            const current = await request.get(path, { headers });
            expect(current.status()).toBe(200);
            const open: PublicPollResponse = await current.json();
            expect(open.status).toBe("open");
            expect(open.proposedDates).toHaveLength(count);
            const selectedDateId = `${draft.id}-date-${count}`;
            expect(selectedDateId).toBeTruthy();
            expect((await request.post(`${path}/close`, { headers, data: {
              selectedDateId, confirmed: true
            } })).status()).toBe(200);
          }
          polls.push({ id: draft.id, title: fixture.title, status, count });
        }
      });
      const before = await Promise.all(polls.map(({ id }) => snapshot(request, id, headers)));
      const requests: Request[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(request);
      });
      // Make link recovery unavailable. The dashboard must never depend on it;
      // even a failed canonical share panel must leave owner navigation usable.
      await page.route("**/api/organiser/polls/*/share-link", (route) => route.fulfill({
        status: 500, contentType: "application/json",
        body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Controlled recovery failure" } })
      }));
      const loaded = page.locator(".my-polls-loaded");
      const results = page.getByRole("region", { name: "Owned polls", exact: true });
      const visibleList = page.locator(`.my-polls-${layout}`);
      const links = visibleList.locator(layout === "desktop" ? "tbody th a:not(.my-polls-open)" : "h2 a:not(.my-polls-open)");
      const dashboardOnly = async () => {
        await expect(page.locator(".my-polls").getByRole("region", { name: /Share/, includeHidden: true })).toHaveCount(0);
        await expect(page.locator(".my-polls").getByRole("button", { name: /Copy link|Regenerate link/, includeHidden: true })).toHaveCount(0);
        await expect(page.getByLabel("Public poll link", { exact: true })).toBeHidden();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      };
      await test.step("responsive Active landing reports only the loaded set", async () => {
        const response = listResponse(page);
        await page.goto(`/?testRunId=${encodeURIComponent(runId)}`);
        expect((await response).status()).toBe(200);
        await expect(loaded).toHaveText("2 polls loaded");
        await expect(loaded).toHaveAttribute("aria-live", "polite");
        await expect(links).toHaveText([polls[1]!.title, polls[0]!.title]);
        await expect(visibleList).toBeVisible();
        await expect(page.locator(`.my-polls-${layout === "desktop" ? "mobile" : "desktop"}`)).toBeHidden();
        await dashboardOnly();
        expect(requests.map((request) => new URL(request.url()).pathname)).toEqual(["/api/organiser/polls"]);
      });
      await test.step("debounce sends one final query; pending feedback never claims a total", async () => {
        const filtered = listResponse(page);
        await filterButton(page, "Open").click();
        expect((await filtered).status()).toBe(200);
        await expect(loaded).toHaveText("1 poll loaded");
        await page.clock.install();
        await page.clock.pauseAt(new Date(Date.now() + 1_000));
        const previous = requests.length;
        // Hold a real API response to observe pending UI deterministically.
        let release!: () => void;
        const held = new Promise<void>((resolve) => { release = resolve; });
        await page.route("**/api/organiser/polls?*", async (route) => {
          const response = await route.fetch();
          await held;
          await route.fulfill({ response });
        });
        try {
          await searchField(page).fill("C");
          await searchField(page).fill("Compact");
          await searchField(page).fill("Compact 9");
          await page.clock.runFor(249);
          expect(requests).toHaveLength(previous);
          const searched = listResponse(page);
          await page.clock.runFor(1);
          await expect(results).toHaveAttribute("aria-busy", "true");
          await expect(page.locator(".my-polls-status")).toHaveText("Loading your polls…");
          await expect(loaded).toBeEmpty();
          await expect(links).toHaveCount(0);
          release();
          const response = await searched;
          expect(response.status()).toBe(200);
          const body: OwnedPollListResponse = await response.json();
          expect(body.items.map(({ id }) => id)).toEqual([polls[1]!.id]);
          await expect(loaded).toHaveText("1 poll loaded");
          await expect(results).toHaveAttribute("aria-busy", "false");
          await page.clock.runFor(500);
          expect(requests).toHaveLength(previous + 1);
          expect(Object.fromEntries(new URL(response.url()).searchParams)).toEqual({ filter: "open", search: "Compact 9", pageSize: "25" });
        } finally {
          release();
          await page.unroute("**/api/organiser/polls?*");
          await page.clock.resume();
        }
        await searchField(page).fill("No matching title");
        await expect(loaded).toHaveText("0 polls loaded");
        await expect(page.locator(".my-polls-status")).toHaveText("No polls match your search.");
        await page.getByRole("button", { name: "Clear search", exact: true }).click();
        await expect(searchField(page)).toBeFocused();
        await expect(loaded).toHaveText("1 poll loaded");
        await expect(filterButton(page, "Open")).toHaveAttribute("aria-pressed", "true");
      });
      await test.step("each lifecycle discloses saved dates and returns from its owner destination", async () => {
        for (const poll of polls) {
          const filtered = listResponse(page);
          await filterButton(page, poll.status[0]!.toUpperCase() + poll.status.slice(1)).click();
          expect((await filtered).status()).toBe(200);
          await expect(loaded).toHaveText("1 poll loaded");
          await expect(links).toHaveText([poll.title]);
          const entry = visibleList.locator(layout === "desktop" ? "tbody tr" : "article")
            .filter({ hasText: poll.title }).first();
          await expect(entry.getByRole("listitem")).toHaveText(dateLabels.slice(0, 3));
          const show = entry.getByRole("button", { name: "Show dates", exact: true });
          const controls = await show.getAttribute("aria-controls");
          await show.press("Enter");
          const disclosure = poll.count > 8 ? page.getByRole("dialog", { name: `Proposed dates for ${poll.title}`, exact: true })
            : page.locator(`[id="${controls}"]`);
          await expect(disclosure.getByRole("listitem")).toHaveText(dateLabels.slice(0, poll.count));
          if (poll.count > 8) await page.keyboard.press("Escape");
          else await entry.getByRole("button", { name: "Hide dates", exact: true }).press("Enter");
          await expect(show).toBeFocused();
          if (poll.status === "closed") await expect(entry.getByText(`Final date: ${dateLabels[19]}`, { exact: true })).toBeVisible();
          await dashboardOnly();
          const shareReads = requests.filter((request) => request.url().includes("/share-link")).length;
          await links.click();
          await expect(page).toHaveURL((url) => url.searchParams.get("pollId") === poll.id &&
            url.searchParams.get("view") === (poll.status === "draft" ? "editor" : "manage"));
          if (poll.status === "draft") await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(poll.title);
          else await expect(page.getByRole("region", { name: "Share poll", exact: true }).getByRole("alert"))
            .toHaveText("We couldn't retrieve this poll's link. Try again.");
          const returned = listResponse(page);
          await page.getByRole("link", { name: /^(?:←\s*)?My polls$/ }).click();
          expect((await returned).status()).toBe(200);
          await expect(loaded).toHaveText("1 poll loaded");
          await expect(links).toHaveText([poll.title]);
          await expect(page).toHaveURL((url) => url.searchParams.get("filter") === poll.status && !url.searchParams.has("pollId"));
          expect(requests.filter((request) => request.url().includes("/share-link"))).toHaveLength(shareReads + (poll.status === "draft" ? 0 : 1));
        }
        await page.getByRole("link", { name: "Create poll", exact: true }).click();
        await expect(page.getByRole("textbox", { name: "Title", exact: true })).toBeVisible();
        await expect(page).toHaveURL((url) => url.searchParams.get("view") === "create" && !url.searchParams.has("pollId"));
      });
      expect(requests.every((request) => request.method() === "GET"), "dashboard and navigation cannot issue writes").toBe(true);
      expect(await Promise.all(polls.map(({ id }) => snapshot(request, id, headers))), "disclosure and navigation preserve poll state and history").toEqual(before);
    });
  });
}
