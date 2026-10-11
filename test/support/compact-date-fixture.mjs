import { createSummaryFixture, savedChoices } from "./my-polls-component-fixture.mjs";

// T-153 presentation decisions, independent of production constants/formatters.
export const datePreviewLimit = 3;
export const inlineDateLimit = 8;
export const dateLabels = Object.freeze([
  "Thu, 31 Dec 2026",
  "Sun, 25 Oct 2026, 01:30 · Europe/London · UTC+01:00",
  "Sun, 25 Oct 2026, 01:30 · Europe/London · UTC+00:00",
  "Sat, 2 Jan 2027",
  "Mon, 1 Feb 2027", "Tue, 2 Feb 2027", "Wed, 3 Feb 2027", "Thu, 4 Feb 2027",
  "Fri, 5 Feb 2027", "Sat, 6 Feb 2027", "Sun, 7 Feb 2027", "Mon, 8 Feb 2027",
  "Tue, 9 Feb 2027", "Wed, 10 Feb 2027", "Thu, 11 Feb 2027", "Fri, 12 Feb 2027",
  "Sat, 13 Feb 2027", "Sun, 14 Feb 2027", "Mon, 15 Feb 2027", "Tue, 16 Feb 2027"
]);

export function compactSummary(count, { status = "draft", id = `compact-${count}` } = {}) {
  const choices = [...structuredClone(savedChoices), ...Array.from({ length: 16 }, (_, index) => ({
    kind: "date", localDate: `2027-02-${String(index + 1).padStart(2, "0")}`
  }))];
  return {
    id, title: `Compact ${count} dates ${status}`, status,
    createdAt: "2026-10-03T23:30:00.000Z", timeZone: "Europe/London",
    proposedDates: choices.slice(0, count), participantCount: 2,
    // Choose outside the preview, never assume that the first choice is final.
    ...(status === "closed" ? { finalDate: structuredClone(choices[count - 1]) } : {})
  };
}

export function compactFixture(items) {
  // Deliberately scripted future list contract; no per-poll detail fetch is needed.
  return createSummaryFixture({ replies: [{ status: 200, body: { items } }] });
}
