import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";

async function closedPoll(request: APIRequestContext, testRunId: string) {
  const headers = { "x-local-organiser-id": `local-organiser-${testRunId}` };
  const created = await request.post("/api/organiser/polls", { headers, data: {
    title: "Reopen autumn plans", timeZone: "Europe/London", proposedDates: [
      { kind: "date", localDate: "2026-10-10" },
      { kind: "date-time", localDateTime: "2026-10-17T18:00" }
    ]
  } });
  expect(created.status()).toBe(201);
  const draft = await created.json();
  const management = `/api/organiser/polls/${draft.id}`;
  const published = await request.post(`${management}/publish`, { headers });
  const { publicUrl } = await published.json();
  const publicPath = `/api/public/polls/${new URL(publicUrl).pathname.split("/").at(-1)}`;
  const added = await request.post(`${publicPath}/participants`, { data: { displayName: "Alice" } });
  const poll = await added.json();
  const first = poll.proposedDates[0].id;
  const second = poll.proposedDates[1].id;
  expect((await request.post(`${management}/close`, { headers, data: { selectedDateId: first, confirmed: true } })).status()).toBe(200);
  return { management, publicUrl, publicPath, headers, first, second };
}

// S-024 / US-28–US-30: desktop and mobile complete lifecycle, cancellation, live participant view, immutable history.
for (const selection of ["same", "different"]) test(`reopen and close again on the ${selection} date preserves distinct history`, async ({ page, browser, request, testRunId }, testInfo) => {
  if (selection === "different") await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await closedPoll(request, testRunId);
  await page.goto(`${fixture.publicUrl}?testRunId=${encodeURIComponent(testRunId)}&organiser=1`);
  const before = await (await request.get(fixture.publicPath)).json();
  const historyBefore = await (await request.get(`${fixture.management}/history`, { headers: fixture.headers })).json();
  const trigger = page.getByRole("button", { name: "Reopen poll…", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Reopen this poll?" });
  await expect(dialog).toContainText("People with the link can change responses again.");
  await expect(dialog).toContainText("Saturday 10 October 2026 will stay as a provisional pick until you close the poll again.");
  await expect(dialog.getByRole("button", { name: "Reopen poll", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("button", { name: "+ Add a row" })).toHaveCount(0);
  expect(await (await request.get(fixture.publicPath)).json()).toEqual(before);
  expect(await (await request.get(`${fixture.management}/history`, { headers: fixture.headers })).json()).toEqual(historyBefore);
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(await (await request.get(fixture.publicPath)).json()).toEqual(before);

  const context = await browser.newContext();
  const participantPage = await context.newPage();
  await participantPage.goto(fixture.publicUrl);
  await expect(participantPage.getByRole("button", { name: "Reopen poll…" })).toHaveCount(0);
  await trigger.click();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Open", { exact: true })).toBeVisible();
  const provisional = page.getByRole("region", { name: "Provisional selection" });
  await expect(provisional).toContainText("Provisional");
  await expect(provisional).toContainText("The poll was reopened — this date may change.");
  await expect(provisional).toContainText("Saturday 10 October 2026");
  await expect(provisional).toHaveCSS("border-top-style", "dashed");
  await expect(page.locator(".final-date-poster")).not.toBeVisible();
  await expect(page.locator(".public-table .final-date-cell")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Most popular dates" })).toBeVisible();
  const provisionalBox = await provisional.boundingBox();
  const rankingBox = await page.getByRole("list", { name: "Most popular dates" }).boundingBox();
  expect(provisionalBox!.y).toBeLessThan(rankingBox!.y);
  await expect(participantPage.getByRole("button", { name: "+ Add a row" })).toBeVisible();
  const toggle = participantPage.getByRole("button", { name: "Alice, Sat 17 Oct 18:00: No", exact: true });
  await toggle.focus();
  await participantPage.keyboard.press("Space");
  await expect(participantPage.getByRole("button", { name: "Alice, Sat 17 Oct 18:00: Yes", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Most popular dates" }).getByRole("listitem").first()).toContainText("Sat 17 Oct 18:00");
  await expect(page.getByRole("list", { name: "Most popular dates" }).getByRole("listitem").first()).toContainText("1 yes");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await testInfo.attach(`reopened-${selection}.png`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  const selectedDateId = selection === "same" ? fixture.first : fixture.second;
  await page.locator(`[data-choice-id="${selectedDateId}"]`).getByRole("button", { name: "Pick…" }).click();
  await page.getByRole("dialog", { name: "Final date" }).getByRole("button", { name: "Confirm & close poll" }).click();
  await expect(page.getByText("Closed", { exact: true })).toBeVisible();
  await expect(provisional).not.toBeVisible();
  await expect(page.locator(".final-date-poster")).toContainText(selection === "same" ? "Saturday 10 October 2026" : "Saturday 17 October 2026, 18:00");
  await expect(participantPage.getByRole("button", { name: "+ Add a row" })).toHaveCount(0);
  await expect(participantPage.getByRole("list", { name: "Final ranking" }).getByRole("listitem").first()).toContainText("1 yes");
  const history = await (await request.get(`${fixture.management}/history`, { headers: fixture.headers })).json();
  const lifecycle = history.items.filter((event: { action: string }) => ["POLL_CLOSED", "POLL_REOPENED"].includes(event.action));
  expect(lifecycle.map((event: { action: string }) => event.action)).toEqual(["POLL_CLOSED", "POLL_REOPENED", "POLL_CLOSED"]);
  expect(new Set(lifecycle.map((event: { revision: number }) => event.revision)).size).toBe(3);
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(page.getByRole("rowheader", { name: "Selected the final date and closed the poll", exact: true })).toHaveCount(2);
  await expect(page.getByRole("rowheader", { name: "Reopened the poll; the previous final date is provisional", exact: true })).toBeVisible();
  await expect(page.locator(".history-table")).not.toContainText(new URL(fixture.publicUrl).pathname.split("/").at(-1)!);
  await context.close();
});
