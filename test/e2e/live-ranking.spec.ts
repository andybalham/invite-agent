import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";

type ProposedDate =
  | { kind: "date"; localDate: string }
  | { kind: "date-time"; localDateTime: string };

const sevenDates: ProposedDate[] = [
  { kind: "date", localDate: "2026-10-10" },
  { kind: "date-time", localDateTime: "2026-10-11T18:00" },
  { kind: "date-time", localDateTime: "2026-10-12T19:30" },
  { kind: "date", localDate: "2026-10-13" },
  { kind: "date-time", localDateTime: "2026-10-14T20:00" },
  { kind: "date", localDate: "2026-10-15" },
  { kind: "date-time", localDateTime: "2026-10-16T17:45" }
];

async function publish(
  request: APIRequestContext,
  testRunId: string,
  proposedDates: ProposedDate[] = sevenDates
) {
  const headers = { "x-local-organiser-id": `local-organiser-${testRunId}` };
  const created = await request.post("/api/organiser/polls", {
    headers,
    data: {
      title: "Ranking matrix",
      timeZone: "Europe/London",
      proposedDates
    }
  });
  expect(created.status()).toBe(201);
  const draft = await created.json();
  const published = await request.post(`/api/organiser/polls/${draft.id}/publish`, { headers });
  expect(published.status()).toBe(200);
  return published.json() as Promise<{ publicUrl: string }>;
}

async function addParticipant(
  request: APIRequestContext,
  token: string,
  displayName: string,
  yesIndexes: number[]
) {
  const collection = `/api/public/polls/${token}/participants`;
  let response = await request.post(collection, { data: { displayName } });
  expect(response.status()).toBe(201);
  let poll = await response.json();
  const participant = poll.participants.find(
    (candidate: { displayName: string }) => candidate.displayName === displayName
  );
  for (const index of yesIndexes) {
    response = await request.put(`${collection}/${participant.id}`, {
      data: { dateId: poll.proposedDates[index].id, availability: "yes" }
    });
    expect(response.status()).toBe(200);
    poll = await response.json();
  }
  return poll;
}

// S-016 / US-17-US-19: public ranking is backend ordered, ranking-first, and capped at five.
test("renders ordinal, zoned date or date-time, and Yes totals for the backend top five", async ({
  page,
  request,
  testRunId
}) => {
  const { publicUrl } = await publish(request, testRunId);
  const token = new URL(publicUrl).pathname.split("/").at(-1) as string;
  await addParticipant(request, token, "Alice", [0, 1, 3, 5]);
  await addParticipant(request, token, "Bob", [1, 2, 3, 5]);
  await addParticipant(request, token, "Charlie", [1, 2, 4]);

  await page.goto(publicUrl);

  const ranking = page.getByRole("list", { name: "Most popular dates" });
  await expect(ranking).toBeVisible();
  await expect(page.getByRole("heading", { name: "Most popular dates" })).toBeVisible();
  await expect(page.getByText("Top 5 by Yes · ties keep the original order · updates live")).toBeVisible();
  await expect(ranking.getByRole("listitem")).toHaveCount(5);
  await expect(ranking.getByRole("listitem").nth(0)).toContainText("1");
  await expect(ranking.getByRole("listitem").nth(0)).toContainText("Sun 11 Oct 18:00");
  await expect(ranking.getByRole("listitem").nth(0)).toContainText("3 yes");
  await expect(ranking.getByRole("listitem").nth(1)).toContainText("Mon 12 Oct 19:30");
  await expect(ranking.getByRole("listitem").nth(1)).toContainText("2 yes");
  await expect(ranking.getByRole("listitem").nth(2)).toContainText("Tue 13 Oct");
  await expect(ranking.getByRole("listitem").nth(3)).toContainText("Thu 15 Oct");
  await expect(ranking.getByRole("listitem").nth(4)).toContainText("Sat 10 Oct");
  await expect(page.getByText("Times in Europe/London")).toBeVisible();

  const rankingBox = await ranking.boundingBox();
  const answersBox = await page.getByRole("heading", { name: "Everyone's answers" }).boundingBox();
  expect(rankingBox).not.toBeNull();
  expect(answersBox).not.toBeNull();
  expect(rankingBox!.y).toBeLessThan(answersBox!.y);

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(ranking).toBeVisible();
  await expect(ranking.getByRole("listitem").nth(0)).toContainText("Sun 11 Oct 18:00");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  ).toBe(true);
});

test("renders every entry when fewer than five choices are proposed and keeps zero-total ties stable", async ({
  page,
  request,
  testRunId
}) => {
  const { publicUrl } = await publish(request, testRunId, sevenDates.slice(0, 2));
  await page.goto(publicUrl);

  const items = page.getByRole("list", { name: "Most popular dates" }).getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("1");
  await expect(items.nth(0)).toContainText("Sat 10 Oct");
  await expect(items.nth(0)).toContainText("0 yes");
  await expect(items.nth(1)).toContainText("2");
  await expect(items.nth(1)).toContainText("Sun 11 Oct 18:00");
  await expect(items.nth(1)).toContainText("0 yes");
});

test("another client's add, toggle, rename, and delete refresh ranking and totals from the server", async ({
  browser,
  request,
  testRunId
}) => {
  const { publicUrl } = await publish(request, testRunId, sevenDates.slice(0, 2));
  const observerContext = await browser.newContext();
  const editorContext = await browser.newContext();
  const observer = await observerContext.newPage();
  const editor = await editorContext.newPage();
  await Promise.all([observer.goto(publicUrl), editor.goto(publicUrl)]);

  const observerRanking = observer.getByRole("list", { name: "Most popular dates" });
  await expect(observerRanking.getByRole("listitem").nth(0)).toContainText("Sat 10 Oct");
  await expect(observerRanking.getByRole("listitem").nth(0)).toContainText("0 yes");

  await editor.getByRole("button", { name: "+ Add a row" }).click();
  await editor.getByLabel("Display name").fill("Alice");
  await editor.getByRole("button", { name: "Add row", exact: true }).click();
  await expect(observer.getByRole("row", { name: /Alice/ })).toBeVisible();

  await editor.getByRole("button", { name: /^Alice, Sun 11 Oct 18:00: No$/ }).click();
  await expect(observerRanking.getByRole("listitem").nth(0)).toContainText("Sun 11 Oct 18:00");
  await expect(observerRanking.getByRole("listitem").nth(0)).toContainText("1 yes");
  await expect(observer.getByRole("row", { name: /Yes total/ })).toContainText("1");

  await editor.getByRole("button", { name: "Actions for Alice" }).click();
  await editor.getByRole("button", { name: "Rename…" }).click();
  await editor.getByLabel("New name").fill("Alice Smith");
  await editor.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(observer.getByRole("row", { name: /Alice Smith/ })).toBeVisible();
  await expect(observerRanking.getByRole("listitem").nth(0)).toContainText("1 yes");

  await editor.getByRole("button", { name: "Actions for Alice Smith" }).click();
  await editor.getByRole("button", { name: "Delete…" }).click();
  await editor.getByLabel("Type Alice Smith to confirm").fill("Alice Smith");
  await editor.getByRole("button", { name: "Delete row" }).click();
  await expect(observer.getByText("No one has answered yet.")).toBeVisible();
  await expect(observerRanking.getByRole("listitem").nth(0)).toContainText("Sat 10 Oct");
  await expect(observerRanking.getByRole("listitem").nth(0)).toContainText("0 yes");

  await observerContext.close();
  await editorContext.close();
});
