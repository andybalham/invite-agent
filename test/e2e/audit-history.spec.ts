import { expect, test } from "./fixtures";

test("the owning organiser sees accessible newest-first history with meaningful changes", async ({ page, request, testRunId }) => {
  const headers = { "x-local-organiser-id": `local-organiser-${testRunId}` };
  const created = await request.post("/api/organiser/polls", {
    headers,
    data: {
      title: "History design check",
      location: "Community Hall",
      timeZone: "Europe/London",
      proposedDates: [
        { kind: "date", localDate: "2026-10-10" },
        { kind: "date", localDate: "2026-10-17" }
      ]
    }
  });
  const poll = await created.json();
  const published = await request.post(`/api/organiser/polls/${poll.id}/publish`, { headers });
  const { publicUrl } = await published.json();
  const token = new URL(publicUrl).pathname.split("/").at(-1);
  await request.post(`/api/public/polls/${token}/participants`, { data: { displayName: "Alice" } });

  await page.goto(`/?pollId=${poll.id}&testRunId=${testRunId}&view=history`);
  await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await expect(page.getByText("3 changes, newest first. Undo adds a new entry — nothing is ever removed.")).toBeVisible();
  const rows = page.getByRole("table", { name: "Poll history" }).getByRole("row");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(1)).toContainText("Alice");
  await expect(rows.nth(1)).toContainText("Anonymous link holder");
  await expect(rows.nth(3)).toContainText("organiser");
  await expect(page.getByText(/Bearer|cookie|session|publicTokenHash|requestBody/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Load older changes" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "← Back to poll" })).toBeVisible();
});

test("history remains usable at a mobile viewport", async ({ page, request, testRunId }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const headers = { "x-local-organiser-id": `local-organiser-${testRunId}` };
  const created = await request.post("/api/organiser/polls", {
    headers,
    data: { title: "Mobile history", timeZone: "Europe/London", proposedDates: [{ kind: "date", localDate: "2026-10-10" }, { kind: "date", localDate: "2026-10-17" }] }
  });
  const poll = await created.json();
  await page.goto(`/?pollId=${poll.id}&testRunId=${testRunId}&view=history`);
  await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: "Poll history" })).toBeVisible();
  expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
});

test("link holders and authenticated non-owners cannot access audit routes or history controls", async ({ page, request, testRunId }) => {
  const ownerHeaders = { "x-local-organiser-id": `local-organiser-${testRunId}` };
  const otherHeaders = { "x-local-organiser-id": `local-organiser-${testRunId}-other` };
  const created = await request.post("/api/organiser/polls", {
    headers: ownerHeaders,
    data: {
      title: "Private organiser history",
      timeZone: "Europe/London",
      proposedDates: [
        { kind: "date", localDate: "2026-10-10" },
        { kind: "date", localDate: "2026-10-17" }
      ]
    }
  });
  const poll = await created.json();
  const published = await request.post(`/api/organiser/polls/${poll.id}/publish`, { headers: ownerHeaders });
  const { publicUrl } = await published.json();
  const token = new URL(publicUrl).pathname.split("/").at(-1)!;
  await request.post(`/api/public/polls/${token}/participants`, { data: { displayName: "Confidential Alice" } });
  const ownerHistory = await request.get(`/api/organiser/polls/${poll.id}/history`, { headers: ownerHeaders });
  const beforeHistory = await ownerHistory.json();
  const event = beforeHistory.items[0];
  const routes = [
    { method: "get", path: `/api/organiser/polls/${poll.id}/history` },
    { method: "post", path: `/api/organiser/polls/${poll.id}/history/${event.id}/undo-preview` },
    { method: "post", path: `/api/organiser/polls/${poll.id}/history/${event.id}/undo`, data: { confirmed: true } }
  ] as const;

  for (const route of routes) {
    const linkHolder = await request.fetch(route.path, {
      method: route.method,
      headers: { authorization: `Bearer ${token}`, "x-public-link-token": token },
      data: "data" in route ? route.data : undefined
    });
    expect(linkHolder.status()).toBe(401);
    expect(JSON.stringify(await linkHolder.json())).not.toContain(event.id);
    expect(JSON.stringify(await linkHolder.json())).not.toContain("Confidential Alice");

    const nonOwner = await request.fetch(route.path, {
      method: route.method,
      headers: otherHeaders,
      data: "data" in route ? route.data : undefined
    });
    expect(nonOwner.status()).toBe(403);
    const error = JSON.stringify(await nonOwner.json());
    expect(error).not.toContain(event.id);
    expect(error).not.toContain("Confidential Alice");
  }

  const afterPoll = await request.get(`/api/public/polls/${token}`);
  expect((await afterPoll.json()).participants.map(({ displayName }: { displayName: string }) => displayName)).toEqual(["Confidential Alice"]);
  const afterHistory = await request.get(`/api/organiser/polls/${poll.id}/history`, { headers: ownerHeaders });
  expect(await afterHistory.json()).toEqual(beforeHistory);

  await page.goto(publicUrl);
  await expect(page.getByRole("link", { name: /History/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Undo/i })).toHaveCount(0);

  await page.goto(`/?pollId=${poll.id}&testRunId=${testRunId}-other&view=history`);
  await expect(page.getByRole("heading", { name: "History isn’t available" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Poll history" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Undo/i })).toHaveCount(0);
  await expect(page.getByText("Confidential Alice")).toHaveCount(0);
});
