import { expect, test } from "./fixtures";

test.describe("primary Gather design", () => {
  test("uses the Gather chrome and Modernist draft hierarchy", async ({ page, testRunId }, testInfo) => {
    await page.goto(`/?testRunId=${encodeURIComponent(testRunId)}`);

    await expect(page.getByRole("link", { name: "Gather home" })).toBeVisible();
    await expect(page.getByText("Draft · only you can see this", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "New poll" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Preview" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
    await expect(page.getByText("Shape the plan.", { exact: true })).toHaveCount(0);

    const design = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const main = document.querySelector("main");
      const input = document.querySelector("input");
      return {
        background: root.getPropertyValue("--color-bg").trim(),
        accent: root.getPropertyValue("--color-accent").trim(),
        fontFamily: getComputedStyle(document.body).fontFamily,
        mainMaxWidth: main ? getComputedStyle(main).maxWidth : "",
        inputRadius: input ? getComputedStyle(input).borderRadius : ""
      };
    });

    expect(design).toEqual({
      background: "#f3f2f2",
      accent: "#ec3013",
      fontFamily: expect.stringContaining("Archivo"),
      mainMaxWidth: "920px",
      inputRadius: "0px"
    });
    await testInfo.attach("gather-draft-desktop.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png"
    });
  });

  test("keeps the draft usable and fluid on a mobile viewport", async ({ page, testRunId }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?testRunId=${encodeURIComponent(testRunId)}`);

    await expect(page.getByRole("heading", { name: "New poll" })).toBeVisible();
    await expect(page.getByLabel("Location — plain text or Markdown, e.g. [map](https://…)")).toBeVisible();

    const layout = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      mainPadding: getComputedStyle(document.querySelector("main") as HTMLElement).paddingLeft
    }));
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.mainPadding).toBe("16px");

    await page.getByLabel("Title").focus();
    await expect(page.getByLabel("Title")).toHaveCSS("outline-style", "solid");
    await expect(page.getByLabel("Title")).toHaveCSS("outline-width", "2px");
    await testInfo.attach("gather-draft-mobile.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png"
    });
  });
});
