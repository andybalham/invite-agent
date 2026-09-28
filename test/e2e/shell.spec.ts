import { expect, test } from "./fixtures";

test("the browser shell loads locally and reports a healthy API", async ({ page, testRunId }) => {
  await page.goto(`/?testRunId=${encodeURIComponent(testRunId)}`);

  await expect(page.getByRole("link", { name: "Gather home" })).toBeVisible();
  await expect(page.getByTestId("api-health")).toHaveText("API healthy");
});
