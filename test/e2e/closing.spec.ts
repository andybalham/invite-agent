import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";

async function publishedPoll(request: APIRequestContext, testRunId: string) {
  const headers = { "x-local-organiser-id": `local-organiser-${testRunId}` };
  const created = await request.post("/api/organiser/polls", { headers, data: {
    title: "Close preview", timeZone: "Europe/London", proposedDates: [
      { kind: "date", localDate: "2026-10-10" },
      { kind: "date-time", localDateTime: "2026-10-17T18:00" }
    ]
  } });
  const draft = await created.json();
  const published = await request.post(`/api/organiser/polls/${draft.id}/publish`, { headers });
  const { publicUrl } = await published.json();
  const token = publicUrl.split("/").at(-1);
  let response = await request.post(`/api/public/polls/${token}/participants`, { data: { displayName: "Alice" } });
  let poll = await response.json();
  response = await request.put(`/api/public/polls/${token}/participants/${poll.participants[0].id}`, {
    data: { dateId: poll.proposedDates[1].id, availability: "yes" }
  });
  poll = await response.json();
  await request.post(`/api/public/polls/${token}/participants`, { data: { displayName: "Bob" } });
  return { pollId: draft.id, publicUrl, selectedDateId: poll.proposedDates[1].id, headers };
}

test("organiser reviews attendance, cancellation is inert, then closes in one confirmation", async ({ page, request, testRunId }) => {
  const fixture = await publishedPoll(request, testRunId);
  await page.goto(`${fixture.publicUrl}?testRunId=${encodeURIComponent(testRunId)}&organiser=1`);

  await page.locator(`[data-choice-id="${fixture.selectedDateId}"]`).getByRole("button", { name: "Pick…" }).click();
  const dialog = page.getByRole("dialog", { name: "Final date" });
  await expect(dialog).toContainText("Saturday 17 October 2026, 18:00");
  await expect(dialog.getByRole("heading", { name: "Yes · 1" })).toBeVisible();
  await expect(dialog.getByText("Alice", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "No · 1" })).toBeVisible();
  await expect(dialog.getByText("Bob", { exact: true })).toBeVisible();
  await expect(dialog).toContainText("Confirming closes the poll. Dates and responses become read-only until you reopen it.");

  await dialog.getByRole("button", { name: "Cancel" }).click();
  let current = await request.get(`/api/organiser/polls/${fixture.pollId}`, { headers: fixture.headers });
  expect((await current.json()).status).toBe("open");
  let history = await request.get(`/api/organiser/polls/${fixture.pollId}/history`, { headers: fixture.headers });
  const beforeCount = (await history.json()).total;

  await page.locator(`[data-choice-id="${fixture.selectedDateId}"]`).getByRole("button", { name: "Pick…" }).click();
  await dialog.getByRole("button", { name: "Confirm & close poll" }).click();
  await expect(page.getByText("Closed", { exact: true })).toBeVisible();
  await expect(page.getByText("IT'S DECIDED")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Final ranking" })).toBeVisible();
  await expect(page.getByText("This poll is closed. Responses are read-only.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Alice, .*: Yes/ })).toHaveCount(0);

  history = await request.get(`/api/organiser/polls/${fixture.pollId}/history`, { headers: fixture.headers });
  const events = await history.json();
  expect(events.total).toBe(beforeCount + 1);
  expect(events.items[0].action).toBe("POLL_CLOSED");
  expect(JSON.stringify(events.items[0])).not.toContain(tokenFrom(fixture.publicUrl));
});

function tokenFrom(publicUrl: string): string {
  return publicUrl.split("/").at(-1) ?? "";
}
