import { createNavigationFixture, navigationOwners } from "./organiser-navigation-fixture.mjs";

export const summaryTitles = Object.freeze({
  draft: "Unfinished autumn plan",
  open: "Repeated-hour supper",
  closed: "Completed summer picnic",
  long: 'A long planning title with <img src=x onerror="window.summaryInjected=true"> & friends — '.repeat(2)
});

// Deliberately nonchronological choices, including both instances of a DST hour.
export const savedChoices = Object.freeze([
  { kind: "date", localDate: "2026-12-31" },
  { kind: "date-time", localDateTime: "2026-10-25T01:30", utcOffset: "+01:00" },
  { kind: "date-time", localDateTime: "2026-10-25T01:30", utcOffset: "+00:00" },
  { kind: "date", localDate: "2027-01-02" }
]);

export function summaryRecords(owner = navigationOwners.olivia) {
  return [
    { id: "draft-1", title: summaryTitles.draft, status: "draft", createdAt: "2026-10-04T08:00:00.000Z",
      timeZone: "Europe/London", proposedDates: [], participants: [] },
    { id: "open-1", title: summaryTitles.open, status: "open", createdAt: "2026-10-03T23:30:00.000Z",
      timeZone: "Europe/London", proposedDates: savedChoices, participants: [{ id: "p-1", responses: {} }, { id: "p-2", responses: {} }] },
    { id: "closed-1", title: summaryTitles.closed, status: "closed", createdAt: "2026-08-01T23:30:00.000Z",
      timeZone: "Europe/London", proposedDates: [{ kind: "date", localDate: "2026-08-12" }], participants: [{ id: "p-3", responses: {} }] }
  ].map((poll) => ({
    ...structuredClone(poll), organiserId: owner, version: 1,
    proposedDates: poll.proposedDates.map((choice, index) => ({ ...choice, id: `date-${index + 1}` })),
    ranking: poll.proposedDates.map((_, index) => ({ choiceId: `date-${index + 1}`, yesTotal: 0 })),
    ...(poll.status === "closed" ? { selectedDateId: "date-1" } : {})
  }));
}

export function heldResponse(response) {
  let resolve;
  let released = false;
  const promise = new Promise((done) => { resolve = done; });
  return {
    promise,
    release() {
      if (released) throw new Error("Component response released twice");
      released = true;
      resolve(structuredClone(response));
    },
    dispose() { if (!released) this.release(); }
  };
}

// Script only authenticated list reads; all navigation/detail behavior and
// request recording use the existing fixture. Never contact an actual API.
export function createSummaryFixture({ records = summaryRecords(), replies } = {}) {
  const fixture = createNavigationFixture();
  for (const record of records) fixture.records.set(record.id, structuredClone(record));
  const queue = replies ? [...replies] : undefined;
  return {
    ...fixture,
    respond(request) {
      const normal = fixture.respond(request);
      const isList = request.method === "GET" && new URL(request.url).pathname === "/api/organiser/polls";
      if (!isList || normal.status !== 200 || !queue) return normal;
      if (!queue.length) throw new Error("Unconfigured component list response: script exhausted");
      const reply = queue.shift();
      return reply.promise ?? structuredClone(reply);
    },
    dispose() { for (const reply of replies ?? []) reply.dispose?.(); }
  };
}

export const emptyPage = Object.freeze({ status: 200, body: { items: [] } });
export const failedPage = Object.freeze({ status: 500, body: { error: { code: "INTERNAL_ERROR", message: "Controlled failure" } } });
