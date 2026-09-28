import { expect, test } from "./fixtures";

const poll = {
  title: "Autumn get-together",
  description: "Choose every date you could attend.",
  instructions: "Please reply by Friday.",
  location: "**Community Hall** — [map](https://example.test/map)",
  timeZone: "Europe/London",
  proposedDates: [
    { kind: "date", localDate: "2026-10-10" },
    { kind: "date-time", localDateTime: "2026-10-17T18:00" }
  ]
};

test("an organiser publishes a valid draft and copies the active public link", async ({
  context,
  page,
  testRunId
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/?testRunId=${encodeURIComponent(testRunId)}`);
  await page.getByLabel("Title").fill(poll.title);
  for (const choice of poll.proposedDates) {
    await page.getByLabel("New proposed date").fill(
      choice.kind === "date" ? choice.localDate : choice.localDateTime.split("T")[0]
    );
    await page.getByLabel("New proposed time").fill(
      choice.kind === "date" ? "" : choice.localDateTime.split("T")[1]
    );
    await page.getByRole("button", { name: "Add date" }).click();
  }
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("heading", { name: "Share this link" })).toBeVisible();
  const link = await page.getByLabel("Public poll link").inputValue();
  expect(link).toMatch(/\/p\/[A-Za-z0-9_-]{32}$/);
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("button", { name: "Copied ✓" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
});

test("a fresh unauthenticated browser renders the safe public poll", async ({
  browser,
  request,
  testRunId
}) => {
  const headers = { "x-local-organiser-id": `local-organiser-${testRunId}` };
  const created = await request.post("/api/organiser/polls", { headers, data: poll });
  const draft = await created.json();
  const published = await request.post(`/api/organiser/polls/${draft.id}/publish`, { headers });
  expect(published.status()).toBe(200);
  const { publicUrl } = await published.json();

  const context = await browser.newContext();
  const publicPage = await context.newPage();
  await publicPage.goto(publicUrl);
  await expect(publicPage.getByText("No account needed", { exact: true })).toBeVisible();
  await expect(publicPage.getByText("Open", { exact: true })).toBeVisible();
  await expect(publicPage.getByRole("heading", { name: poll.title })).toBeVisible();
  await expect(publicPage.getByText("Community Hall — map")).toBeVisible();
  await expect(publicPage.getByText("Times in Europe/London")).toBeVisible();
  await expect(publicPage.getByRole("columnheader", { name: /Sat 10 Oct/ })).toBeVisible();
  await expect(publicPage.getByText("This is a shared table.")).toBeVisible();
  await expect(publicPage.getByText(/organiser-public-poll|POLL_PUBLISHED|publicTokenHash/)).toHaveCount(0);
  await expect(publicPage.getByRole("button", { name: /Publish|Save draft|History/ })).toHaveCount(0);
  await context.close();
});

test("unknown public links render a non-sensitive accessible invalid-link state", async ({ page }) => {
  await page.goto(`/p/${"A".repeat(32)}`);
  await expect(page.getByText("LINK NOT VALID")).toBeVisible();
  await expect(page.getByRole("heading", { name: "This poll link doesn't work" })).toBeVisible();
  await expect(page.getByText(/Ask them for the current link/)).toBeVisible();
});
