import { expect, test } from "./fixtures";

test("an organiser adds, edits, reorders, removes, and revisits ordered choices", async ({
  page,
  testRunId
}) => {
  await page.goto(`/?testRunId=${encodeURIComponent(testRunId)}`);
  await page.getByLabel("Title").fill("Autumn get-together");

  await page.getByLabel("New proposed date").fill("2026-10-10");
  await page.getByLabel("New proposed time").fill("18:00");
  await page.getByRole("button", { name: "Add date" }).click();
  await page.getByLabel("New proposed date").fill("2026-10-17");
  await page.getByRole("button", { name: "Add date" }).click();
  await page.getByLabel("New proposed date").fill("2026-10-24");
  await page.getByRole("button", { name: "Add date" }).click();

  await page.getByLabel("Date 2", { exact: true }).fill("2026-10-18");
  await page.getByRole("button", { name: "Move date 3 up" }).click();
  await page.getByRole("button", { name: "Remove date 2" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();

  await expect(page.getByRole("status")).toContainText("Draft saved");
  await expect(page.getByLabel("Date 1", { exact: true })).toHaveValue("2026-10-10");
  await expect(page.getByLabel("Date 2", { exact: true })).toHaveValue("2026-10-18");
  await page.reload();
  await expect(page.getByLabel("Date 1", { exact: true })).toHaveValue("2026-10-10");
  await expect(page.getByLabel("Date 2", { exact: true })).toHaveValue("2026-10-18");
});

test("duplicates, invalid dates, DST gaps, and folds are explained without adding a choice", async ({
  page,
  testRunId
}) => {
  await page.goto(`/?testRunId=${encodeURIComponent(testRunId)}`);

  await page.getByLabel("New proposed date").fill("2026-10-17");
  await page.getByLabel("New proposed time").fill("18:00");
  await page.getByRole("button", { name: "Add date" }).click();
  await page.getByRole("button", { name: "Add date" }).click();
  await expect(page.getByRole("alert")).toContainText("already proposed");
  await expect(page.getByLabel(/^Date \d+$/)).toHaveCount(1);

  await page.getByLabel("New proposed date").fill("2026-03-29");
  await page.getByLabel("New proposed time").fill("01:30");
  await page.getByRole("button", { name: "Add date" }).click();
  await expect(page.getByRole("alert")).toContainText("does not exist");

  await page.getByLabel("New proposed date").fill("2026-10-25");
  await page.getByRole("button", { name: "Add date" }).click();
  await expect(page.getByRole("alert")).toContainText("happens twice");
  await page.getByLabel("Choose UTC offset").selectOption("+00:00");
  await page.getByRole("button", { name: "Add date" }).click();
  await expect(page.getByLabel(/^Date \d+$/)).toHaveCount(2);
});
