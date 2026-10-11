import { randomUUID } from "node:crypto";
import type { Locator, Page, Request } from "@playwright/test";
import type { OwnedPollListResponse, PublicPollResponse } from "@invite-a-gent/contracts";
import { compactSummary, dateLabels } from "../support/compact-date-fixture.mjs";
import { expect, test } from "./fixtures";

async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= innerWidth))
    .toBe(true);
}

// Visibility alone permits clipped text. Check the actual wrapped text rectangles,
// including labels below the initial scroll position, against their rendering bounds.
async function readableLabel(label: Locator, scrollport?: Locator) {
  await label.scrollIntoViewIfNeeded();
  await expect(label).toBeVisible();
  const port = scrollport ? await scrollport.boundingBox() : null;
  expect(await label.evaluate((element, port) => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const range = document.createRange();
    range.selectNodeContents(element);
    const rectangles = Array.from(range.getClientRects());
    return style.textOverflow !== "ellipsis" && ["none", "0"].includes(style.webkitLineClamp) &&
      element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1 &&
      rectangles.length > 0 && rectangles.every((rect) =>
        rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 &&
        rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1 &&
        rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight &&
        (!port || (rect.left >= port.x - 1 && rect.right <= port.x + port.width + 1 &&
          rect.top >= port.y - 1 && rect.bottom <= port.y + port.height + 1))
      );
  }, port)).toBe(true);
}

async function usableButton(button: Locator) {
  await expect(button).toBeInViewport({ ratio: 1 });
  const bounds = await button.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
}

for (const [layout, viewport] of [
  ["desktop", { width: 1280, height: 900 }],
  ["mobile", { width: 320, height: 568 }]
] as const) {
  test.describe(`T-155 compact proposed dates on ${layout}`, () => {
    // Viewer zone differs from the poll: saved dates and repeated DST hours stay intact.
    test.use({ viewport, timezoneId: "America/Los_Angeles" });

    for (const count of [9, 20]) {
      for (const status of ["draft", "open", "closed"] as const) {
        test(`${status} ${count}-date summary supports mouse, keyboard and readable bounded disclosure`, async ({
          page, request, testRunId
        }) => {
          test.setTimeout(60_000);
          const runId = `${testRunId}-${randomUUID()}`;
          const headers = { "x-local-organiser-id": `local-organiser-${runId}` };
          const fixture = compactSummary(count, { status });
          const created = await request.post("/api/organiser/polls", { headers, data: {
            title: fixture.title, timeZone: fixture.timeZone, proposedDates: fixture.proposedDates
          } });
          expect(created.status()).toBe(201);
          const draft: PublicPollResponse = await created.json();
          const path = `/api/organiser/polls/${draft.id}`;
          if (status !== "draft") expect((await request.post(`${path}/publish`, { headers })).status()).toBe(200);
          if (status === "closed") {
            expect((await request.post(`${path}/close`, { headers, data: {
              selectedDateId: `${draft.id}-date-${count}`, confirmed: true
            } })).status()).toBe(200);
          }
          const before = await request.get(path, { headers });
          expect(before.status()).toBe(200);
          const saved = await before.json();
          const browserRequests: Request[] = [];
          page.on("request", (request) => {
            if (new URL(request.url()).pathname.startsWith("/api/")) browserRequests.push(request);
          });
          const loaded = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/organiser/polls");
          await page.goto(`/?${new URLSearchParams({ testRunId: runId, filter: status })}`);
          const response = await loaded;
          expect(response.status()).toBe(200);
          const body: OwnedPollListResponse = await response.json();
          expect(body.items).toHaveLength(1);
          expect(body.items[0]).toMatchObject({ id: draft.id, status, proposedDates: fixture.proposedDates });
          expect(body.items[0]!.finalDate).toEqual(status === "closed" ? fixture.finalDate : undefined);
          const entry = page.locator(layout === "desktop" ? ".my-polls-desktop tbody tr" : ".my-polls-mobile article")
            .filter({ has: page.getByRole("link", { name: fixture.title, exact: true }) });
          await expect(entry).toBeVisible();
          await expect(page.locator(`.my-polls-${layout === "desktop" ? "mobile" : "desktop"}`)).toBeHidden();
          await expect(entry.locator(".summary-status")).toHaveText(status[0]!.toUpperCase() + status.slice(1));
          await expect(entry.getByText(`${count} proposed dates`, { exact: true })).toBeVisible();
          const preview = entry.getByRole("listitem");
          const show = entry.getByRole("button", { name: "Show dates", exact: true });
          const id = await show.getAttribute("aria-controls");
          expect(id).toMatch(/^proposed-dates-\d+$/);
          const content = page.locator(`[id="${id}"]`);
          await expect(content).toHaveCount(1);
          await expect(show).toHaveAttribute("aria-haspopup", "dialog");
          const compact = async () => {
            await expect(show).toHaveAttribute("aria-expanded", "false");
            await expect(content).toBeHidden();
            await expect(page.getByRole("dialog")).toHaveCount(0);
            await expect(preview).toHaveText(dateLabels.slice(0, 3));
            for (const label of await preview.all()) await readableLabel(label);
            if (status === "closed") {
              const final = entry.getByText(`Final date: ${dateLabels[count - 1]}`, { exact: true });
              await readableLabel(final);
            } else await expect(entry.locator(".my-polls-final-date")).toHaveCount(0);
            await noPageOverflow(page);
          };
          await compact();

          for (const [activation, dismissal] of [["mouse", "mouse"], ["Enter", "Escape"], ["Space", "Enter"]] as const) {
            await test.step(`${activation} open / ${dismissal} close`, async () => {
              await show.scrollIntoViewIfNeeded();
              await usableButton(show);
              if (activation === "mouse") await show.click();
              else {
                await show.focus();
                await expect(show).toBeFocused();
                await page.keyboard.press(activation);
              }
              const dialog = page.getByRole("dialog", { name: `Proposed dates for ${fixture.title}`, exact: true });
              await expect(dialog).toHaveAttribute("id", id!);
              await expect(dialog).toBeVisible();
              await expect(show).toHaveAttribute("aria-expanded", "true");
              const close = dialog.getByRole("button", { name: "Close dates", exact: true });
              const list = dialog.getByRole("list", { name: `All ${count} proposed dates`, exact: true });
              await expect(close).toBeFocused();
              await usableButton(close);
              await page.keyboard.press("Tab");
              await expect(list).toBeFocused();
              await page.keyboard.press("Tab");
              await expect(close).toBeFocused();
              await page.keyboard.press("Shift+Tab");
              await expect(list).toBeFocused();
              await page.keyboard.press("Shift+Tab");
              await expect(close).toBeFocused();
              await expect(dialog.getByRole("listitem")).toHaveText(dateLabels.slice(0, count));
              for (const label of await dialog.getByRole("listitem").all()) await readableLabel(label, list);
              // The close action stays reachable even after reading the final scrolled label.
              await usableButton(close);
              await noPageOverflow(page);
              if (dismissal === "mouse") await close.click();
              else {
                // Escape works from the scrollable list; keyboard close works from its button.
                await (dismissal === "Escape" ? list : close).focus();
                await page.keyboard.press(dismissal);
              }
              await expect(dialog).toBeHidden();
              await expect(show).toBeFocused();
              await compact();
            });
          }
          expect(browserRequests.map((request) => [request.method(), new URL(request.url()).pathname]))
            .toEqual([["GET", "/api/organiser/polls"]]);
          const after = await request.get(path, { headers });
          expect(after.status()).toBe(200);
          expect(await after.json()).toEqual(saved);
        });
      }
    }
  });
}
