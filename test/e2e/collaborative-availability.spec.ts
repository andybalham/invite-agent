import { expect, test } from "./fixtures";
import type { APIRequestContext } from "@playwright/test";

const poll = {
  title: "Collaborative autumn dates",
  timeZone: "Europe/London",
  proposedDates: [
    { kind: "date", localDate: "2026-10-10" },
    { kind: "date-time", localDateTime: "2026-10-17T18:00" }
  ]
};

async function publish(request: APIRequestContext, testRunId: string) {
  const headers = { "x-local-organiser-id": `local-organiser-${testRunId}` };
  const created = await request.post("/api/organiser/polls", { headers, data: poll });
  const draft = await created.json();
  const published = await request.post(`/api/organiser/polls/${draft.id}/publish`, { headers });
  return published.json();
}

test("a link holder adds a trimmed participant whose answers all start No", async ({
  page,
  request,
  testRunId
}) => {
  const { publicUrl } = await publish(request, testRunId);
  await page.goto(publicUrl);
  await page.getByRole("button", { name: "+ Add a row" }).click();
  await page.getByLabel("Display name").fill("  Alice  Cooper  ");
  await page.getByRole("button", { name: "Add row", exact: true }).click();

  const row = page.getByRole("row", { name: /Alice Cooper/ });
  await expect(row).toBeVisible();
  await expect(row.getByText("No", { exact: true })).toHaveCount(2);
});

test("add-row validation preserves input and rejects canonically equivalent duplicates", async ({
  page,
  request,
  testRunId
}) => {
  const { publicUrl } = await publish(request, testRunId);
  await page.goto(publicUrl);
  await page.getByRole("button", { name: "+ Add a row" }).click();
  await page.getByLabel("Display name").fill("Alice");
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  await page.getByRole("button", { name: "+ Add a row" }).click();
  await page.getByLabel("Display name").fill("ＡＬＩＣＥ");
  await page.getByRole("button", { name: "Add row", exact: true }).click();

  await expect(page.getByRole("alert")).toContainText("already in this poll");
  await expect(page.getByLabel("Display name")).toHaveValue("ＡＬＩＣＥ");
  await expect(page.getByRole("row", { name: /Alice/ })).toHaveCount(1);
});

test("a link holder renames and deletes any row with exact-name confirmation", async ({
  page,
  request,
  testRunId
}) => {
  const { publicUrl } = await publish(request, testRunId);
  await page.goto(publicUrl);
  await page.getByRole("button", { name: "+ Add a row" }).click();
  await page.getByLabel("Display name").fill("Alice");
  await page.getByRole("button", { name: "Add row", exact: true }).click();

  await page.getByRole("button", { name: "Actions for Alice" }).click();
  await page.getByRole("button", { name: "Rename…" }).click();
  await page.getByLabel("New name").fill("Alice Smith");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByRole("row", { name: /Alice Smith/ })).toBeVisible();

  await page.getByRole("button", { name: "Actions for Alice Smith" }).click();
  await page.getByRole("button", { name: "Delete…" }).click();
  await page.getByLabel("Type Alice Smith to confirm").fill("alice smith");
  await page.getByRole("button", { name: "Delete row" }).click();
  await expect(page.getByRole("alert")).toContainText("doesn't match");
  await expect(page.getByLabel("Type Alice Smith to confirm")).toHaveValue("alice smith");
  await page.getByLabel("Type Alice Smith to confirm").fill("Alice Smith");
  await page.getByRole("button", { name: "Delete row" }).click();
  await expect(page.getByText("No one has answered yet.")).toBeVisible();
});

test("mouse click and keyboard Space autosave accessible cells and update Yes totals", async ({
  page,
  request,
  testRunId
}) => {
  const { publicUrl } = await publish(request, testRunId);
  await page.goto(publicUrl);
  await page.getByRole("button", { name: "+ Add a row" }).click();
  await page.getByLabel("Display name").fill("Alice");
  await page.getByRole("button", { name: "Add row", exact: true }).click();

  const cells = page.getByRole("button", { name: /^Alice, .+: No$/ });
  await expect(cells).toHaveCount(2);
  await cells.first().click();
  await expect(page.getByRole("button", { name: /^Alice, .+: Yes$/ })).toHaveCount(1);
  await expect(page.getByRole("row", { name: /Yes total/ }).getByText("1", { exact: true })).toHaveCount(1);

  await cells.last().focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: /^Alice, .+: Yes$/ })).toHaveCount(2);
  await expect(page.getByText("Click a cell to switch between Yes and No, or Tab to it and press Space.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Save/ })).toHaveCount(0);
});

test("two stale browser contexts accept overlapping edits and converge without conflict warnings", async ({
  browser,
  request,
  testRunId
}) => {
  const { publicUrl } = await publish(request, testRunId);
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await Promise.all([first.goto(publicUrl), second.goto(publicUrl)]);

  await first.getByRole("button", { name: "+ Add a row" }).click();
  await first.getByLabel("Display name").fill("Alice");
  await first.getByRole("button", { name: "Add row", exact: true }).click();
  await expect(second.getByRole("row", { name: /Alice/ })).toBeVisible();

  const firstCell = first.getByRole("button", { name: /^Alice, .+: No$/ }).first();
  const secondCell = second.getByRole("button", { name: /^Alice, .+: No$/ }).first();
  await firstCell.click();
  await expect(first.getByRole("button", { name: /^Alice, .+: Yes$/ }).first()).toBeVisible();
  await Promise.all([
    first.getByRole("button", { name: /^Alice, .+: Yes$/ }).first().click(),
    secondCell.click()
  ]);

  const token = new URL(publicUrl).pathname.split("/").at(-1);
  const latest = await (await request.get(`/api/public/polls/${token}`)).json();
  const finalValue = latest.participants[0].availability[latest.proposedDates[0].id] === "yes" ? "Yes" : "No";
  await expect(first.getByRole("button", { name: new RegExp(`^Alice, .+: ${finalValue}$`) }).first()).toBeVisible();
  await expect(second.getByRole("button", { name: new RegExp(`^Alice, .+: ${finalValue}$`) }).first()).toBeVisible();
  await expect(first.getByText(/conflict/i)).toHaveCount(0);
  await expect(second.getByText(/conflict/i)).toHaveCount(0);
  await firstContext.close();
  await secondContext.close();
});
