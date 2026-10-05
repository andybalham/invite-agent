import { expect, test } from "./fixtures";

async function addDate(page: import("@playwright/test").Page, date: string, time = "18:00") {
  await page.getByLabel("New proposed date").fill(date);
  await page.getByLabel("New proposed time").fill(time);
  await page.getByRole("button", { name: "Add date" }).click();
}

test("preview shows participant-facing draft details without response capability", async ({
  page,
  testRunId
}) => {
  await page.goto(`/?view=create&testRunId=${encodeURIComponent(testRunId)}`);
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Autumn get-together");
  await page.getByLabel("Description").fill("Choose every date you could attend.");
  await page.getByLabel("Location").fill("**Community Hall** — [map](https://example.test/map)");
  await page.getByLabel("Instructions").fill("Please reply by Friday.");
  await addDate(page, "2026-10-10");
  await addDate(page, "2026-10-17");
  await page.getByRole("button", { name: "Save draft" }).click();

  await page.getByRole("button", { name: "Preview" }).click();
  const preview = page.getByRole("region", { name: "Autumn get-together" });
  await expect(page.getByRole("heading", { name: "Autumn get-together" })).toBeVisible();
  await expect(page.getByText("This is what participants will see.")).toBeVisible();
  await expect(preview.getByText("Community Hall — map")).toBeVisible();
  await expect(preview.getByText("Times in Europe/London")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Sat 10 Oct/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Add row/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Yes|No/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Back to editing" }).click();
  await expect(page.getByText("Draft · only you can see this")).toBeVisible();
});

test("readiness stays blocked until every required field is valid", async ({ page, testRunId }) => {
  await page.goto(`/?view=create&testRunId=${encodeURIComponent(testRunId)}`);
  const publish = page.getByRole("button", { name: "Publish" });
  await expect(publish).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("Add a title.");
  await expect(page.getByRole("alert")).toContainText("Add at least two proposed dates.");

  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Autumn get-together");
  await addDate(page, "2026-10-10");
  await expect(page.getByRole("alert")).toContainText("Add at least one more proposed date");
  await addDate(page, "2026-10-17");
  await expect(publish).toBeEnabled();
});

test("unauthenticated draft reads and responses disclose nothing and change nothing", async ({
  page,
  request,
  testRunId
}) => {
  await page.goto(`/?view=create&testRunId=${encodeURIComponent(testRunId)}`);
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Private planning notes");
  await addDate(page, "2026-10-10");
  await addDate(page, "2026-10-17");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  const pollId = new URL(page.url()).searchParams.get("pollId");
  expect(pollId).toBeTruthy();

  const before = await request.get(`/api/organiser/polls/${pollId}`, {
    headers: { "x-local-organiser-id": `local-organiser-${testRunId}` }
  });
  const beforeBody = await before.json();
  const read = await request.get(`/api/public/polls/${pollId}`);
  const write = await request.post(`/api/public/polls/${pollId}/participants`, {
    data: { displayName: "Mallory" }
  });
  expect(read.status()).toBe(404);
  expect(write.status()).toBe(404);
  expect(JSON.stringify(await read.json())).not.toContain("Private planning notes");

  const after = await request.get(`/api/organiser/polls/${pollId}`, {
    headers: { "x-local-organiser-id": `local-organiser-${testRunId}` }
  });
  expect(await after.json()).toEqual(beforeBody);
});

test("the API rejects publication readiness for an incomplete draft without mutation", async ({
  request,
  testRunId
}) => {
  const headers = { "x-local-organiser-id": `local-organiser-${testRunId}` };
  const created = await request.post("/api/organiser/polls", {
    headers,
    data: {
      title: "Incomplete draft",
      timeZone: "Europe/London",
      proposedDates: [{ kind: "date", localDate: "2026-10-10" }]
    }
  });
  expect(created.status()).toBe(201);
  const before = await created.json();

  const readiness = await request.post(
    `/api/organiser/polls/${before.id}/publication-readiness`,
    { headers }
  );
  expect(readiness.status()).toBe(400);
  expect((await readiness.json()).error.message).toContain("at least one more proposed date");

  const after = await request.get(`/api/organiser/polls/${before.id}`, { headers });
  expect(await after.json()).toEqual(before);
});
