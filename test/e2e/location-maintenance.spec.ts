import { expect, test } from "./fixtures";

// S-023 / US-35–US-38: saved projections, correction, owner visibility and Modernist dialog states.
for (const state of ["draft", "open", "closed"] as const) {
  test(`${state}: maintain safe location without changing state`, async ({ page, request, browser, testRunId }, testInfo) => {
    const headers = { "x-local-organiser-id": `local-organiser-${testRunId}` };
    const created = await request.post("/api/organiser/polls", { headers, data: {
      title: "Location lifecycle", timeZone: "Europe/London",
      proposedDates: [{ kind: "date", localDate: "2026-10-10" }, { kind: "date", localDate: "2026-10-17" }]
    } });
    expect(created.status()).toBe(201);
    const draft = await created.json();
    let publicUrl: string | undefined;
    if (state !== "draft") {
      const publication = await request.post(`/api/organiser/polls/${draft.id}/publish`, { headers });
      expect(publication.status()).toBe(200);
      publicUrl = (await publication.json()).publicUrl;
      if (state === "closed") {
        const closed = await request.post(`/api/organiser/polls/${draft.id}/close`, { headers, data: { selectedDateId: `${draft.id}-date-2`, confirmed: true } });
        expect(closed.status()).toBe(200);
      }
    }
    const history = async () => (await (await request.get(`/api/organiser/polls/${draft.id}/history`, { headers })).json());
    await page.goto(publicUrl ? `${publicUrl}?organiser=1&testRunId=${testRunId}` : `/?pollId=${draft.id}&testRunId=${testRunId}`);
    const openEditor = async () => {
      if (state !== "draft") await page.getByRole("button", { name: "Edit location", exact: true }).click();
    };
    const input = state === "draft" ? page.getByRole("textbox", { name: /^Location —/ }) : page.getByRole("dialog", { name: "Location", exact: true }).getByLabel("Plain text or Markdown links");
    const save = state === "draft" ? page.getByRole("button", { name: "Save changes", exact: true }) : page.getByRole("button", { name: "Save location", exact: true });
    const surface = state === "draft" ? page.locator(".preview-meta") : page.locator(".public-location");
    for (const location of ["Community Hall", "**Riverside Room** — [map](https://example.test/map)", ""]) {
      const before = await history();
      await openEditor();
      if (state !== "draft") await expect(input).toBeFocused();
      await input.fill(location);
      await save.click();
      await expect.poll(async () => (await history()).total).toBe(before.total + 1);
      if (state === "draft") await page.getByRole("button", { name: "Preview", exact: true }).click();
      if (location) await expect(surface).toContainText(location.includes("Riverside") ? "Riverside Room — map" : location);
      else await expect(surface).not.toContainText("Where");
      if (location.includes("Riverside")) {
        await expect(surface.locator("a")).toHaveAttribute("href", "https://example.test/map");
        await expect(surface.locator("a")).toHaveAttribute("rel", "noopener noreferrer");
        await expect(surface.locator(".markdown strong")).toHaveText("Riverside Room");
      }
      const poll = await (await request.get(`/api/organiser/polls/${draft.id}`, { headers })).json();
      expect(poll.status).toBe(state);
      if (state === "draft") await page.getByRole("button", { name: "Back to editing" }).click();
    }
    await openEditor();
    await input.fill("Community Hall");
    await save.click();
    await expect.poll(async () => (await history()).items[0].after.location).toBe("Community Hall");
    const beforeInvalid = await history();
    await openEditor();
    for (const invalid of ["[bad](javascript:alert(1))", "😀".repeat(4_001), "<script>alert(1)</script>", "**unfinished"]) {
      await input.fill(invalid);
      await save.click();
      await expect(input).toHaveValue(invalid);
      await expect(state === "draft" ? page.locator(".form-message [role=alert]") : page.getByRole("dialog").getByRole("alert")).toBeVisible();
      expect((await history()).total).toBe(beforeInvalid.total);
      const poll = await (await request.get(`/api/organiser/polls/${draft.id}`, { headers })).json();
      expect(poll.location).toBe("Community Hall");
    }
    if (state !== "draft") {
      const dialog = page.getByRole("dialog", { name: "Location", exact: true });
      await page.setViewportSize({ width: 375, height: 812 });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(`the poll stays ${state === "closed" ? "Closed" : "Open"}`);
      expect(await dialog.evaluate((element) => getComputedStyle(element).borderRadius)).toBe("0px");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await testInfo.attach(`location-${state}-mobile.png`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await openEditor();
      await page.getByRole("button", { name: "Clear location", exact: true }).click();
      await expect(surface).not.toContainText("Community Hall");
      await expect(dialog).not.toBeVisible();
      const anonymousContext = await browser.newContext();
      const anonymous = await anonymousContext.newPage();
      await anonymous.goto(publicUrl!);
      await expect(anonymous.getByRole("heading", { name: "Location lifecycle" })).toBeVisible();
      await expect(anonymous.getByRole("button", { name: "Edit location" })).toHaveCount(0);
      await anonymousContext.close();
      await page.goto(`${publicUrl}?organiser=1&testRunId=wrong-owner`);
      await expect(page.getByRole("heading", { name: "Location lifecycle" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Edit location" })).toHaveCount(0);
    }
  });
}
