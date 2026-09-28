import { expect, test } from "./fixtures";

test("an organiser creates, revisits, and edits a private draft with safe location Markdown", async ({
  page,
  testRunId
}) => {
  await page.goto(`/?testRunId=${encodeURIComponent(testRunId)}`);

  await page.getByLabel("Title").fill("Autumn get-together");
  await page.getByLabel("Description").fill("Choose every date you could attend.");
  await page
    .getByLabel("Location")
    .fill("**Community Hall** — [map](https://example.test/map)");
  await page.getByLabel("Instructions").fill("Please reply by Friday.");
  await page.getByRole("button", { name: "Save draft" }).click();

  await expect(page.getByRole("status")).toContainText("Draft saved");
  await expect(page.getByTestId("location-preview")).toContainText("Community Hall — map");
  await expect(page.getByTestId("location-preview").locator("a")).toHaveAttribute(
    "href",
    "https://example.test/map"
  );

  const savedUrl = page.url();
  await page.reload();
  await expect(page.getByLabel("Title")).toHaveValue("Autumn get-together");
  await expect(page.getByLabel("Location")).toHaveValue(
    "**Community Hall** — [map](https://example.test/map)"
  );

  await page.getByLabel("Title").fill("Autumn planning session");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText("Changes saved");
  await expect(page).toHaveURL(savedUrl);
});

test("hostile or excessive location input stays editable and never replaces saved content", async ({
  page,
  testRunId
}) => {
  await page.goto(`/?testRunId=${encodeURIComponent(testRunId)}`);
  await page.getByLabel("Title").fill("Security review");
  await page.getByLabel("Location").fill("Community Hall");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");

  const hostile = "[click](javascript:alert(document.cookie))";
  await page.getByLabel("Location").fill(hostile);
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("alert")).toContainText("secure HTTPS links");
  await expect(page.getByLabel("Location")).toHaveValue(hostile);
  await expect(page.getByTestId("saved-location")).toHaveText("Community Hall");
  await expect(page.getByTestId("location-preview").locator("script")).toHaveCount(0);
  await expect(page.getByTestId("saved-location").locator("script")).toHaveCount(0);

  await page.getByLabel("Location").fill("😀".repeat(4_001));
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toContainText("4,000 characters or fewer");
  await expect(page.getByTestId("saved-location")).toHaveText("Community Hall");
});
