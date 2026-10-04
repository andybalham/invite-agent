import type { Page } from "@playwright/test";
import type { ProposedDateInput, PublicPollResponse } from "@invite-a-gent/contracts";
import { expect, test, type SmokeHarness } from "./smoke-fixtures";
import { smokeData as data } from "./smoke-data";

test.use({ actionTimeout: 15_000, navigationTimeout: 15_000 });

async function addDate(page: Page, choice: ProposedDateInput): Promise<void> {
  const [date, time = ""] = (choice.kind === "date" ? choice.localDate : choice.localDateTime).split("T");
  await page.getByLabel("New proposed date").fill(date!);
  await page.getByLabel("New proposed time").fill(time);
  await page.getByRole("button", { name: "Add date", exact: true }).click();
}

async function ranking(page: Page, totals: number[], order: number[], closed = false): Promise<void> {
  const entries = page.getByRole("list", { name: closed ? "Final ranking" : "Most popular dates" }).getByRole("listitem");
  await expect(entries).toHaveCount(3);
  for (const [rank, index] of order.entries()) {
    await expect(entries.nth(rank)).toContainText(data.labels[index]!);
    await expect(entries.nth(rank)).toContainText(`${totals[index]} yes`);
  }
  const cells = page.getByRole("row", { name: /Yes total/ }).getByRole("cell");
  for (const [index, total] of totals.entries()) await expect(cells.nth(index)).toHaveText(String(total));
}

async function matrix(smoke: SmokeHarness, pages: Page[], totals = [2, 3, 1], closed = false): Promise<PublicPollResponse> {
  const poll = await smoke.publicPoll();
  const ids = poll.proposedDates.map(({ id }) => id);
  expect(poll.participants.map(({ displayName }) => displayName)).toEqual(["Alice", "Bob", "Charlie"]);
  for (const participant of poll.participants) {
    const answers = data.matrix[participant.displayName as keyof typeof data.matrix];
    expect(ids.map((id) => participant.availability[id])).toEqual(answers);
    for (const page of pages) {
      const row = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: participant.displayName, exact: true }) });
      await expect(row).toBeVisible();
      if (!closed) for (const [index, answer] of answers.entries()) {
        await expect(page.getByRole("button", { name: `${participant.displayName}, ${data.labels[index]}: ${answer === "yes" ? "Yes" : "No"}`, exact: true })).toBeVisible();
      }
    }
  }
  expect(poll.ranking).toEqual([1, 0, 2].map((index) => ({ choiceId: ids[index], yesTotal: totals[index] })));
  for (const page of pages) await ranking(page, totals, [1, 0, 2], closed);
  return poll;
}

async function addParticipant(smoke: SmokeHarness, page: Page, name: string) {
  const event = await smoke.accepted(page, "public-1", `add ${name}`, ["PARTICIPANT_ADDED"], async () => {
    await page.getByRole("button", { name: "+ Add a row", exact: true }).click();
    await page.getByLabel("Display name").fill(name);
    await page.getByRole("button", { name: "Add row", exact: true }).click();
    await expect(page.getByRole("button", { name: new RegExp(`^${name}, .+: No$`) })).toHaveCount(3);
  }, { type: "participant" });
  expect(event.before).toBeNull();
  const poll = await smoke.publicPoll();
  const participant = poll.participants.find(({ displayName }) => displayName === name)!;
  expect(participant.id).toBe(event.entity.id);
  expect(Object.values(participant.availability)).toEqual(["no", "no", "no"]);
  expect(event.after).toEqual({ displayName: name, availability: participant.availability });
  return participant.id;
}

async function toggle(smoke: SmokeHarness, page: Page, role: string, name: string, index: number, from = "No", keyboard = false) {
  const poll = await smoke.publicPoll();
  const participant = poll.participants.find(({ displayName }) => displayName === name)!;
  const dateId = poll.proposedDates[index]!.id;
  const to = from === "No" ? "Yes" : "No";
  const event = await smoke.accepted(page, role, `${name} ${data.labels[index]} ${from} to ${to}`, ["AVAILABILITY_CHANGED"], async () => {
    const cell = page.getByRole("button", { name: `${name}, ${data.labels[index]}: ${from}`, exact: true });
    if (keyboard) { await cell.focus(); await page.keyboard.press("Space"); }
    else await cell.click();
    await expect(page.getByRole("button", { name: `${name}, ${data.labels[index]}: ${to}`, exact: true })).toBeVisible();
  }, { type: "availability", id: `${participant.id}:${dateId}` });
  expect(event.before).toEqual({ value: from.toLowerCase() });
  expect(event.after).toEqual({ value: to.toLowerCase() });
  return event;
}

async function safeLocation(page: Page, name: string): Promise<void> {
  const location = page.locator(".public-location");
  await expect(location.locator(".markdown strong")).toHaveText(name);
  await expect(location.getByRole("link", { name: "map", exact: true })).toHaveAttribute("href", "https://example.test/map");
  await expect(location.locator("a")).toHaveAttribute("rel", "noopener noreferrer");
  await expect(location.locator("script, iframe, [onclick], [onerror], [onload]")).toHaveCount(0);
}

test("deterministic local smoke journey SM-01 through SM-11", async ({ smoke, page, context }) => {
  // Allows headroom over the measured local journey without hiding a stalled checkpoint.
  test.setTimeout(180_000);
  let first: Page;
  let second: Page;
  let ids: string[];
  let aliceId: string;
  const initialTitle = `Autumn get-together [smoke ${smoke.runId}]`;
  const finalTitle = `Autumn planning session [smoke ${smoke.runId}]`;

  await smoke.step("SM-01: Local readiness and persisted private draft", async () => {
    const web = await smoke.api.get("/");
    expect(web.status(), "Local web readiness; start the stack first").toBe(200);
    const health = await smoke.call("GET", "/health");
    expect(health.response.status(), "API/DynamoDB readiness; inspect service logs").toBe(200);
    expect(health.body).toEqual({ status: "ok" });
    await page.goto(`/?view=create&testRunId=${smoke.runId}`);
    await page.getByLabel("Title").fill(initialTitle);
    await page.getByLabel("Description").fill(data.description);
    await page.getByLabel("Instructions").fill(data.instructions);
    await page.getByLabel("Location").fill(data.location);
    await page.getByLabel("Time zone").selectOption(data.timeZone);
    await addDate(page, data.dates[0]);
    await smoke.accepted(page, "owner", "save initial private draft", ["POLL_CREATED"], async () => {
      const created = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/organiser/polls" && response.request().method() === "POST");
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      const response = await created;
      expect(response.status()).toBe(201);
      await smoke.recordCreatedPoll((await response.json()).id);
      await expect(page.getByRole("status")).toContainText("Draft saved");
    });
    expect(new URL(page.url()).searchParams.get("pollId")).toBe(smoke.pollId);
    await page.reload();
    await expect(page.getByLabel("Title")).toHaveValue(initialTitle);
    await expect(page.getByLabel("Location")).toHaveValue(data.location);
    const before = await smoke.snapshot(false);
    expect(before.owner).toMatchObject({ status: "draft", title: initialTitle, timeZone: data.timeZone });
    await smoke.unchanged(() => smoke.rejected("GET", smoke.management, 401, "UNAUTHENTICATED"), false);
  });

  await smoke.step("SM-02: Prepare, validate, and preview ordered dates", async () => {
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
    await expect(page.getByRole("alert")).toContainText("at least one more proposed date");
    await smoke.unchanged(async () => {
      await smoke.rejected("POST", `${smoke.management}/publish`, 400, "VALIDATION_ERROR", { headers: smoke.headers });
      await smoke.rejected("GET", `/api/public/polls/${smoke.pollId}`, 404, "NOT_FOUND");
    }, false);
    await expect(page.getByLabel("Public poll link")).not.toBeVisible();
    for (const choice of data.dates.slice(1)) await addDate(page, choice);
    await addDate(page, { kind: "date", localDate: "2026-10-31" });
    await page.getByLabel("Date 4", { exact: true }).fill("2026-11-01");
    await page.getByRole("button", { name: "Move date 4 up", exact: true }).click();
    await expect(page.getByLabel("Date 3", { exact: true })).toHaveValue("2026-11-01");
    await page.getByRole("button", { name: "Remove date 3", exact: true }).click();
    await page.getByLabel("Title").fill(finalTitle);
    const event = await smoke.accepted(page, "owner", "save prepared dates and edited title", ["POLL_DETAILS_UPDATED"], async () => {
      await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("Changes saved");
    }, { type: "poll", id: smoke.pollId });
    expect(event.before).toMatchObject({ title: initialTitle });
    expect(event.after).toMatchObject({ title: finalTitle });
    await page.reload();
    await expect(page.getByLabel("Title")).toHaveValue(finalTitle);
    for (const [index, choice] of data.dates.entries()) {
      await expect(page.getByLabel(`Date ${index + 1}`, { exact: true })).toHaveValue(choice.kind === "date" ? choice.localDate : choice.localDateTime.split("T")[0]!);
      await expect(page.getByLabel(`Time ${index + 1}`, { exact: true })).toHaveValue(choice.kind === "date" ? "" : "18:00");
    }
    await smoke.unchanged(async () => {
      await page.getByRole("button", { name: "Preview", exact: true }).click();
      const preview = page.getByRole("region", { name: finalTitle });
      await expect(preview).toContainText(data.description);
      await expect(preview).toContainText(data.instructions);
      await expect(preview).toContainText("Times in Europe/London");
      await expect(preview).toContainText("Community Hall — map");
      for (const label of data.labels) await expect(preview.getByRole("columnheader", { name: label, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: /Add row/ })).toBeDisabled();
      await expect(preview.getByRole("button", { name: /: (Yes|No)$/ })).toHaveCount(0);
      await page.getByRole("button", { name: "Back to editing", exact: true }).click();
      await expect(page.getByText("Draft · only you can see this")).toBeVisible();
    }, false);
  });

  await smoke.step("SM-03: Publish, copy, and open the exact issued public link", async () => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    // Publish deliberately saves draft details first: assert one revision for each of these two writes.
    await smoke.accepted(page, "owner", "publish prepared draft", ["POLL_DETAILS_UPDATED", "POLL_PUBLISHED"], async () => {
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await expect(page.getByRole("heading", { name: finalTitle, exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: "Organiser controls" })).toBeVisible();
      smoke.publicUrl = await page.getByLabel("Public poll link").inputValue();
    }, { type: "poll", id: smoke.pollId });
    const url = new URL(smoke.publicUrl);
    expect(url.origin).toBe(smoke.baseURL);
    expect(url.pathname).toMatch(/^\/p\/[A-Za-z0-9_-]{32}$/);
    expect(url.search).toBe("");
    await page.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(page.getByRole("button", { name: "Copied ✓" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(smoke.publicUrl);
    first = await smoke.publicPage("public-1");
    second = await smoke.publicPage("public-2");
    ids = (await smoke.publicPoll()).proposedDates.map(({ id }) => id);
    const publicPoll = await smoke.publicPoll();
    expect(publicPoll.status).toBe("open");
    expect(publicPoll.proposedDates).toMatchObject(data.dates);
    expect(publicPoll.participants).toEqual([]);
    for (const publicPage of [first, second]) {
      await expect(publicPage.getByText("No account needed", { exact: true })).toBeVisible();
      await expect(publicPage.getByRole("heading", { name: finalTitle, exact: true })).toBeVisible();
      await expect(publicPage.getByRole("button", { name: /Publish|Save draft|Edit location|Pick…|Reopen/ })).toHaveCount(0);
      await expect(publicPage.getByRole("link", { name: "History", exact: true })).toHaveCount(0);
      await safeLocation(publicPage, "Community Hall");
      await ranking(publicPage, [0, 0, 0], [0, 1, 2]);
    }
    await page.goto(smoke.ownerUrl);
    await expect(page.getByRole("button", { name: "Edit location", exact: true })).toBeVisible();
  });

  await smoke.step("SM-04: Shared rows, mouse/keyboard availability, totals and ranking", async () => {
    const originalCharlie: string[] = [];
    for (const name of ["Alice", "Bob", "Charlie"] as const) {
      const id = await addParticipant(smoke, first, name);
      if (name === "Alice") aliceId = id;
      if (name === "Charlie") originalCharlie.push(id);
      await expect(second.getByRole("button", { name: new RegExp(`^${name}, .+: No$`) })).toHaveCount(3);
    }
    for (const [name, answers] of Object.entries(data.matrix)) for (const [index, answer] of answers.entries()) {
      if (answer !== "yes") continue;
      const editor = name === "Bob" ? second : first;
      await toggle(smoke, editor, name === "Bob" ? "public-2" : "public-1", name, index, "No", name === "Alice" && index === 1);
      await expect((editor === first ? second : first).getByRole("button", { name: `${name}, ${data.labels[index]}: Yes`, exact: true })).toBeVisible();
    }
    await matrix(smoke, [first, second]);
    for (const [from, to] of [["Bob", "Robert"], ["Robert", "Bob"]]) {
      const beforeAnswers = (await smoke.publicPoll()).participants.find(({ displayName }) => displayName === from)!.availability;
      const event = await smoke.accepted(second, "public-2", `rename ${from} to ${to}`, ["PARTICIPANT_RENAMED"], async () => {
        await second.getByRole("button", { name: `Actions for ${from}`, exact: true }).click();
        await second.getByRole("button", { name: "Rename…", exact: true }).click();
        await second.getByLabel("New name").fill(to!);
        await second.getByRole("button", { name: "Rename", exact: true }).click();
        await expect(first.getByRole("button", { name: `Actions for ${to}`, exact: true })).toBeVisible();
      }, { type: "participant" });
      expect(event.before).toEqual({ displayName: from });
      expect(event.after).toEqual({ displayName: to });
      expect((await smoke.publicPoll()).participants.find(({ displayName }) => displayName === to)!.availability).toEqual(beforeAnswers);
      for (const publicPage of [first, second]) await ranking(publicPage, [2, 3, 1], [1, 0, 2]);
    }
    await smoke.accepted(first, "public-1", "delete Charlie with exact-name confirmation", ["PARTICIPANT_DELETED"], async () => {
      await first.getByRole("button", { name: "Actions for Charlie", exact: true }).click();
      await first.getByRole("button", { name: "Delete…", exact: true }).click();
      await first.getByLabel("Type Charlie to confirm").fill("Charlie");
      await first.getByRole("button", { name: "Delete row", exact: true }).click();
      await expect(second.getByRole("button", { name: "Actions for Charlie", exact: true })).toHaveCount(0);
    }, { type: "participant", id: originalCharlie[0] });
    for (const publicPage of [first, second]) await ranking(publicPage, [2, 2, 0], [0, 1, 2]);
    const restoredId = await addParticipant(smoke, first, "Charlie");
    expect(restoredId).not.toBe(originalCharlie[0]);
    for (const index of [1, 2]) await toggle(smoke, first, "public-1", "Charlie", index);
    await matrix(smoke, [first, second]);
  });

  await smoke.step("SM-05: Duplicate name rejection is atomic and correctable", async () => {
    await smoke.unchanged(async () => {
      await first.getByRole("button", { name: "+ Add a row", exact: true }).click();
      await first.getByLabel("Display name").fill("alice");
      const responsePromise = first.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/participants"));
      await first.getByRole("button", { name: "Add row", exact: true }).click();
      const response = await responsePromise;
      expect(response.status()).toBe(409);
      expect((await response.json()).error.code).toBe("CONFLICT");
      await expect(first.getByRole("alert")).toContainText("already in this poll");
      await expect(first.getByLabel("Display name")).toHaveValue("alice");
      await first.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    });
    await matrix(smoke, [first, second]);
  });

  await smoke.step("SM-06: Safe location editing and rejected unsafe input", async () => {
    const event = await smoke.accepted(page, "owner", "edit location while open", ["LOCATION_CHANGED"], async () => {
      await page.getByRole("button", { name: "Edit location", exact: true }).click();
      await page.getByLabel("Plain text or Markdown links").fill(data.openLocation);
      await page.getByRole("button", { name: "Save location", exact: true }).click();
      for (const publicPage of [first, second]) await safeLocation(publicPage, "Riverside Room");
    }, { type: "poll", id: smoke.pollId });
    expect(event.before).toEqual({ location: data.location });
    expect(event.after).toEqual({ location: data.openLocation });
    expect((await smoke.publicPoll()).status).toBe("open");
    await smoke.unchanged(async () => {
      await page.getByRole("button", { name: "Edit location", exact: true }).click();
      await page.getByLabel("Plain text or Markdown links").fill(data.unsafeLocation);
      await page.getByRole("button", { name: "Save location", exact: true }).click();
      await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
      await expect(page.getByLabel("Plain text or Markdown links")).toHaveValue(data.unsafeLocation);
      // The UI validates locally; also exercise server rejection with the same valid-shaped payload.
      await smoke.rejected("PUT", `${smoke.management}/location`, 400, "VALIDATION_ERROR", { headers: smoke.headers, data: { location: data.unsafeLocation } });
      await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    });
    await safeLocation(first, "Riverside Room");
  });

  await smoke.step("SM-07: Newest-first audit and an isolated availability undo", async () => {
    const target = await toggle(smoke, first, "public-1", "Alice", 0, "Yes");
    for (const publicPage of [first, second]) await ranking(publicPage, [1, 3, 1], [1, 0, 2]);
    await page.goto(smoke.historyUrl);
    const table = page.getByRole("table", { name: "Poll history" });
    await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
    const row = table.getByRole("row").filter({ has: page.getByRole("cell", { name: `#${target.revision}`, exact: true }) });
    await expect(table.getByRole("row").nth(1)).toContainText(`#${target.revision}`);
    await expect(row).toContainText(target.summary);
    await expect(row).toContainText("Anonymous link holder");
    // Current UI summarizes availability in the action; structured before/after is verified via API.
    await expect(row).toContainText("Changed availability from yes to no");
    await expect(row.getByRole("cell").nth(3)).toHaveText("Changed values");
    await expect(row.getByRole("cell").nth(4)).toHaveText("Changed values");
    await expect(row.getByRole("cell").nth(1)).not.toHaveText("");
    const undo = await smoke.accepted(page, "owner", `undo revision ${target.revision}`, ["UNDO"], async () => {
      await row.getByRole("button", { name: "Undo", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: `Undo #${target.revision}?`, exact: true });
      await expect(dialog).toContainText("The original entry stays in the history");
      await dialog.getByRole("button", { name: "Undo change", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("Undone");
    }, target.entity);
    expect(undo.undoOf).toEqual({ id: target.id, revision: target.revision });
    expect((await smoke.history()).find(({ id }) => id === target.id)).toEqual(target);
    await matrix(smoke, [first, second]);
    await page.goto(smoke.ownerUrl);
  });

  await smoke.step("SM-08: Server organiser and public capability authorization", async () => {
    const target = (await smoke.history()).find(({ action }) => action === "AVAILABILITY_CHANGED")!;
    const token = new URL(smoke.publicUrl).pathname.split("/").at(-1)!;
    await smoke.unchanged(async () => {
      await smoke.rejected("GET", smoke.management, 401, "UNAUTHENTICATED");
      await smoke.rejected("GET", `${smoke.management}/history`, 401, "UNAUTHENTICATED");
      await smoke.rejected("POST", `${smoke.management}/history/${target.id}/undo`, 401, "UNAUTHENTICATED", {
        headers: { authorization: `Bearer ${token}`, "x-public-link-token": token }, data: { confirmed: true }
      });
      await smoke.rejected("PUT", `${smoke.management}/location`, 403, "FORBIDDEN", {
        headers: { "x-local-organiser-id": `${smoke.headers["x-local-organiser-id"]}-other` }, data: { location: "Other organiser probe" }
      });
    });
  });

  await smoke.step("SM-09: Cancel then close non-leading A and freeze responses", async () => {
    await smoke.unchanged(async () => {
      await page.locator(`[data-choice-id="${ids[0]}"]`).getByRole("button", { name: "Pick…", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Final date", exact: true });
      await expect(dialog).toContainText("Saturday 10 October 2026");
      await expect(dialog.getByRole("heading", { name: "Yes · 2", exact: true })).toBeVisible();
      await expect(dialog.getByRole("heading", { name: "No · 1", exact: true })).toBeVisible();
      for (const name of ["Alice", "Bob", "Charlie"]) await expect(dialog.getByText(name, { exact: true })).toBeVisible();
      await expect(dialog).toContainText("Confirming closes the poll. Dates and responses become read-only until you reopen it.");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    });
    const close = await smoke.accepted(page, "owner", "close on A", ["POLL_CLOSED"], async () => {
      await page.locator(`[data-choice-id="${ids[0]}"]`).getByRole("button", { name: "Pick…", exact: true }).click();
      await page.getByRole("dialog", { name: "Final date", exact: true }).getByRole("button", { name: "Confirm & close poll", exact: true }).click();
      await expect(page.getByTestId("public-state")).toHaveText("Closed");
    }, { type: "poll", id: smoke.pollId });
    expect(close.after).toMatchObject({ status: "closed", selectedDateId: ids[0] });
    await first.reload();
    await matrix(smoke, [first, second], [2, 3, 1], true);
    for (const publicPage of [first, second]) {
      await expect(publicPage.locator(".final-date-poster")).toContainText("Saturday 10 October 2026");
      await expect(publicPage.getByRole("button", { name: /: (Yes|No)$|Actions for|Add a row|Pick…/ })).toHaveCount(0);
    }
    await smoke.unchanged(async () => {
      await smoke.rejected("PUT", `${smoke.publicPath}/participants/${aliceId}`, 422, "INVALID_LIFECYCLE", { data: { dateId: ids[0], availability: "no" } });
      await smoke.rejected("PUT", smoke.management, 422, "INVALID_LIFECYCLE", { headers: smoke.headers, data: {
        title: finalTitle, description: data.description, instructions: data.instructions, location: data.openLocation,
        timeZone: data.timeZone, proposedDates: [data.dates[0], data.dates[1], { kind: "date", localDate: "2026-10-25" }]
      } });
    });
    const frozen = await smoke.publicPoll();
    await smoke.accepted(page, "owner", "clear location while closed", ["LOCATION_CHANGED"], async () => {
      await page.getByRole("button", { name: "Edit location", exact: true }).click();
      await page.getByRole("button", { name: "Clear location", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Location", exact: true })).not.toBeVisible();
    }, { type: "poll", id: smoke.pollId });
    await first.reload();
    await expect(first.locator(".public-location")).not.toContainText("Riverside Room");
    const cleared = await smoke.publicPoll();
    expect(cleared.location).toBe("");
    expect(cleared.status).toBe("closed");
    expect(cleared.selectedDateId).toBe(frozen.selectedDateId);
    expect(cleared.ranking).toEqual(frozen.ranking);
    expect(cleared.participants).toEqual(frozen.participants);
  });

  await smoke.step("SM-10: Cancel/confirm reopening, edit again and close on C", async () => {
    await smoke.unchanged(async () => {
      await page.getByRole("button", { name: "Reopen poll…", exact: true }).click();
      await page.getByRole("dialog", { name: "Reopen this poll?", exact: true }).getByRole("button", { name: "Cancel", exact: true }).click();
    });
    await smoke.accepted(page, "owner", "reopen closed poll", ["POLL_REOPENED"], async () => {
      await page.getByRole("button", { name: "Reopen poll…", exact: true }).click();
      await page.getByRole("dialog", { name: "Reopen this poll?", exact: true }).getByRole("button", { name: "Reopen poll", exact: true }).click();
      await expect(page.getByTestId("public-state")).toHaveText("Open");
    }, { type: "poll", id: smoke.pollId });
    expect(await smoke.publicPoll()).toMatchObject({ status: "open", selectedDateId: ids[0], provisional: true });
    await expect(page.getByRole("region", { name: "Provisional selection" })).toContainText("Saturday 10 October 2026");
    await expect(first.getByRole("button", { name: "+ Add a row", exact: true })).toBeVisible();
    await toggle(smoke, first, "public-1", "Alice", 2);
    for (const publicPage of [first, second]) await ranking(publicPage, [2, 3, 2], [1, 0, 2]);
    await smoke.accepted(page, "owner", "close again on C", ["POLL_CLOSED"], async () => {
      await page.locator(`[data-choice-id="${ids[2]}"]`).getByRole("button", { name: "Pick…", exact: true }).click();
      await page.getByRole("dialog", { name: "Final date", exact: true }).getByRole("button", { name: "Confirm & close poll", exact: true }).click();
      await expect(page.getByTestId("public-state")).toHaveText("Closed");
    }, { type: "poll", id: smoke.pollId });
    const poll = await smoke.publicPoll();
    expect(poll).toMatchObject({ status: "closed", selectedDateId: ids[2] });
    expect(poll.provisional).toBeUndefined();
    expect(poll.participants.find(({ id }) => id === aliceId)!.availability[ids[2]!]).toBe("yes");
    for (const publicPage of [first, second]) {
      await expect(publicPage.locator(".final-date-poster")).toContainText("Saturday 24 October 2026, 18:00");
      await ranking(publicPage, [2, 3, 2], [1, 0, 2], true);
      await expect(publicPage.getByRole("button", { name: /: (Yes|No)$|Add a row/ })).toHaveCount(0);
    }
    expect((await smoke.history()).filter(({ action }) => ["POLL_CLOSED", "POLL_REOPENED"].includes(action)).map(({ action }) => action)).toEqual(["POLL_CLOSED", "POLL_REOPENED", "POLL_CLOSED"]);
  });

  await smoke.step("SM-11: Test-only revocation hook rejects old-link reads and writes", async () => {
    const before = await smoke.snapshot();
    await smoke.revokeOwnCapability();
    await smoke.rejected("GET", smoke.publicPath, 410, "LINK_REVOKED");
    await smoke.rejected("PUT", `${smoke.publicPath}/participants/${aliceId}`, 410, "LINK_REVOKED", { data: { dateId: ids[2], availability: "no" } });
    expect(await smoke.snapshot(false)).toEqual({ owner: before.owner, history: before.history });
    await first.reload();
    await expect(first.getByText("LINK NOT VALID", { exact: true })).toBeVisible();
    await expect(first.getByRole("heading", { name: "This poll link doesn't work", exact: true })).toBeVisible();
    await expect(first.getByRole("button", { name: /: (Yes|No)$|Add a row/ })).toHaveCount(0);
    await expect(first.getByText(finalTitle, { exact: true })).toHaveCount(0);
    expect(await smoke.snapshot(false)).toEqual({ owner: before.owner, history: before.history });
  });
});
