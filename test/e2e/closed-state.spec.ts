import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";

async function closeNonLeadingDate(request: APIRequestContext, testRunId: string) {
  const headers = { "x-local-organiser-id": `local-organiser-closed-ui-owner-${testRunId}` };
  const created = await request.post("/api/organiser/polls", { headers, data: {
    title: "Frozen autumn result",
    timeZone: "Europe/London",
    proposedDates: [
      { kind: "date", localDate: "2026-10-10" },
      { kind: "date-time", localDateTime: "2026-10-17T18:00" },
      { kind: "date", localDate: "2026-10-24" }
    ]
  } });
  expect(created.status()).toBe(201);
  const draft = await created.json();
  const published = await request.post(`/api/organiser/polls/${draft.id}/publish`, { headers });
  expect(published.status()).toBe(200);
  const { publicUrl } = await published.json();
  const token = new URL(publicUrl).pathname.split("/").at(-1) as string;
  const collection = `/api/public/polls/${token}/participants`;
  let poll;
  for (const [displayName, yesIndexes] of [["Alice", [0, 1]], ["Bob", [0]], ["Chandra", [1]]] as const) {
    let response = await request.post(collection, { data: { displayName } });
    expect(response.status()).toBe(201);
    poll = await response.json();
    const participant = poll.participants.find((candidate: { displayName: string }) => candidate.displayName === displayName);
    for (const index of yesIndexes) {
      response = await request.put(`${collection}/${participant.id}`, {
        data: { dateId: poll.proposedDates[index].id, availability: "yes" }
      });
      expect(response.status()).toBe(200);
      poll = await response.json();
    }
  }
  const selectedDateId = poll.proposedDates[2].id;
  const frozenRanking = structuredClone(poll.ranking);
  expect(frozenRanking[0].choiceId).not.toBe(selectedDateId);
  const closed = await request.post(`/api/organiser/polls/${draft.id}/close`, {
    headers,
    data: { selectedDateId, confirmed: true }
  });
  expect(closed.status()).toBe(200);
  return { publicUrl, selectedDateId, frozenRanking };
}

// S-022 / US-26-US-27: ranking-first closed UI is read-only, accessible, responsive, and stable in fresh contexts.
test("closed public page keeps the selected non-leader primary and the closing ranking frozen", async ({
  browser,
  page,
  request,
  testRunId
}) => {
  const fixture = await closeNonLeadingDate(request, testRunId);
  await page.goto(fixture.publicUrl);

  const poster = page.locator(".final-date-poster");
  const ranking = page.getByRole("list", { name: "Final ranking" });
  const answers = page.getByRole("heading", { name: "Everyone's answers" });
  await expect(page.getByTestId("public-state")).toHaveText("Closed");
  await expect(poster).toContainText("IT'S DECIDED");
  await expect(poster.getByRole("heading", { name: "Saturday 24 October 2026" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Final ranking" })).toBeVisible();
  await expect(page.getByText("Frozen when the poll closed · read-only")).toBeVisible();
  await expect(ranking.getByRole("listitem")).toHaveCount(3);
  await expect(ranking.getByRole("listitem").nth(0)).toContainText("Sat 10 Oct");
  await expect(ranking.getByRole("listitem").nth(2)).toContainText("Sat 24 Oct ★");
  await expect(page.getByText("This poll is closed. Responses are read-only.")).toBeVisible();

  const posterBox = await poster.boundingBox();
  const rankingBox = await ranking.boundingBox();
  const answersBox = await answers.boundingBox();
  expect(posterBox).not.toBeNull();
  expect(rankingBox).not.toBeNull();
  expect(answersBox).not.toBeNull();
  expect(posterBox!.y).toBeLessThan(rankingBox!.y);
  expect(rankingBox!.y).toBeLessThan(answersBox!.y);

  await expect(page.getByRole("button", { name: "+ Add a row" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Alice, .*: (Yes|No)/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Actions for Alice" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(Rename|Delete|Pick|Move date|Add date)/ })).toHaveCount(0);
  await expect(page.getByText("Click a cell to switch between Yes and No")).toHaveCount(0);

  const initialRanking = await ranking.allTextContents();
  await page.reload();
  await expect(page.getByRole("list", { name: "Final ranking" })).toHaveText(initialRanking);
  await expect(page.locator(".final-date-poster")).toContainText("Saturday 24 October 2026");

  const freshContext = await browser.newContext();
  const freshPage = await freshContext.newPage();
  await freshPage.goto(fixture.publicUrl);
  await expect(freshPage.locator(".final-date-poster")).toContainText("Saturday 24 October 2026");
  await expect(freshPage.getByRole("list", { name: "Final ranking" })).toHaveText(initialRanking);
  await expect(freshPage.getByRole("button", { name: "+ Add a row" })).toHaveCount(0);
  await freshContext.close();

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator(".final-date-poster")).toBeVisible();
  await expect(page.getByRole("list", { name: "Final ranking" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
