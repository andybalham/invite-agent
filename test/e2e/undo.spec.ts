import { expect, test } from "./fixtures";

test("owner previews and confirms an isolated row-add undo from accessible history", async ({ page, request, testRunId }) => {
  const headers = { "x-local-organiser-id": `local-organiser-${testRunId}` };
  const created = await request.post("/api/organiser/polls", { headers, data: {
    title: "Undo design check", timeZone: "Europe/London",
    proposedDates: [{ kind: "date", localDate: "2026-10-10" }, { kind: "date", localDate: "2026-10-17" }]
  } });
  const poll = await created.json();
  const published = await request.post(`/api/organiser/polls/${poll.id}/publish`, { headers });
  const token = new URL((await published.json()).publicUrl).pathname.split("/").at(-1);
  await request.post(`/api/public/polls/${token}/participants`, { data: { displayName: "Alice" } });

  await page.goto(`/?pollId=${poll.id}&testRunId=${testRunId}&view=history`);
  const aliceRow = page.getByRole("row").filter({ hasText: "Added participant Alice" });
  await expect(aliceRow.getByRole("button", { name: "Undo" })).toBeVisible();
  await aliceRow.getByRole("button", { name: "Undo" }).click();
  const dialog = page.getByRole("dialog", { name: /Undo #/ });
  await expect(dialog).toContainText("Remove participant Alice");
  await expect(dialog).toContainText("The original entry stays in the history. A new Undo entry is added.");
  await dialog.getByRole("button", { name: "Undo change" }).click();
  await expect(page.getByRole("status")).toContainText("Undone");
  await expect(page.getByRole("row").filter({ hasText: "Undo #" })).toHaveCount(1);
  const publicPoll = await request.get(`/api/public/polls/${token}`);
  expect((await publicPoll.json()).participants).toEqual([]);
});

test("owner sees an overwrite warning, can cancel without change, then explicitly confirms", async ({ page, request, testRunId }) => {
  const headers = { "x-local-organiser-id": `local-organiser-${testRunId}` };
  const created = await request.post("/api/organiser/polls", { headers, data: {
    title: "Warned undo", timeZone: "Europe/London",
    proposedDates: [{ kind: "date", localDate: "2026-10-10" }, { kind: "date", localDate: "2026-10-17" }]
  } });
  const poll = await created.json();
  const published = await request.post(`/api/organiser/polls/${poll.id}/publish`, { headers });
  const token = new URL((await published.json()).publicUrl).pathname.split("/").at(-1);
  const added = await request.post(`/api/public/polls/${token}/participants`, { data: { displayName: "Alice" } });
  const addedPoll = await added.json();
  const alice = addedPoll.participants[0];
  const dateId = addedPoll.proposedDates[0].id;
  await request.put(`/api/public/polls/${token}/participants/${alice.id}`, { data: { dateId, availability: "yes" } });
  const history = await request.get(`/api/organiser/polls/${poll.id}/history`, { headers });
  const selected = (await history.json()).items.find(({ action }) => action === "AVAILABILITY_CHANGED");
  await request.put(`/api/public/polls/${token}/participants/${alice.id}`, { data: { dateId, availability: "no" } });

  await page.goto(`/?pollId=${poll.id}&testRunId=${testRunId}&view=history`);
  const selectedRow = page.getByRole("row").filter({ hasText: selected.summary }).last();
  await selectedRow.getByRole("button", { name: "Undo" }).click();
  const dialog = page.getByRole("dialog", { name: `Undo #${selected.revision}?` });
  await expect(dialog).toContainText(/later change.*overwrites that newer value/i);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).not.toBeVisible();
  let current = await (await request.get(`/api/public/polls/${token}`)).json();
  expect(current.participants[0].availability[dateId]).toBe("no");

  await selectedRow.getByRole("button", { name: "Undo" }).click();
  await dialog.getByRole("button", { name: "Overwrite & undo" }).click();
  await expect(page.getByRole("status")).toContainText("Undone");
  current = await (await request.get(`/api/public/polls/${token}`)).json();
  expect(current.participants[0].availability[dateId]).toBe("no");
  await expect(page.getByRole("row").filter({ hasText: `Undo #${selected.revision}` })).toHaveCount(1);
});
