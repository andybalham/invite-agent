import { expect, test } from "./fixtures";

test("intentional failure retains the complete diagnostic bundle", async ({ page }) => {
  test.skip(process.env.HARNESS_DIAGNOSTIC_PROBE !== "1", "run only to verify failure capture");

  await page.goto("/");
  await expect(page.getByTestId("api-health")).toHaveText("deliberate mismatch");
});
