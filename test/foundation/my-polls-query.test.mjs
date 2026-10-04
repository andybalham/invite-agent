import assert from "node:assert/strict";
import test from "node:test";
import * as contracts from "../../packages/contracts/dist/index.js";
import * as domain from "../../backend/dist/domain/index.js";

function helper(module, name) {
  assert.equal(typeof module[name], "function", `${name} must be exported`);
  return module[name];
}

function query(input = {}) {
  const resolve = helper(contracts, "resolveOwnedPollListQuery");
  const parsed = resolve(input);
  assert.equal(parsed.success, true);
  return parsed.data;
}

function poll(id, status, createdAt, organiserId = "owner") {
  return { id, title: "Autumn dinner", organiserId, status, createdAt, version: 1,
    timeZone: "Europe/London", proposedDates: [] };
}

// S-043 / MP-US-02,04,05,06,10.
test("dashboard query defaults and normalization are explicit and reject malformed input", () => {
  assert.deepEqual(query(), { filter: "active", search: "", pageSize: 25 });
  assert.deepEqual(query({ filter: "closed", search: "  CAFE\u0301\t AUTUMN  ", pageSize: 50 }), {
    filter: "closed", search: "café autumn", pageSize: 50
  });
  const resolve = helper(contracts, "resolveOwnedPollListQuery");
  for (const input of [{ pageSize: 0 }, { filter: "active-ish" }, { search: [] }, { cursor: "offset" }]) {
    assert.equal(resolve(input).success, false);
  }
  const cursor = `v1.e30.${"a".repeat(43)}`;
  assert.equal(query({ cursor }).cursor, cursor, "cursor remains opaque");
  assert.equal(query({ search: " \t\n " }).search, "");
  assert.equal(query({ search: "\u0085\u2003CAFÉ\u0085AUTUMN\u0085" }).search, "café autumn",
    "Unicode whitespace includes NEXT LINE as well as ordinary spaces");
});

test("owned query applies every filter and newest-created order to all supplied candidates", () => {
  const select = helper(domain, "selectOwnedPolls");
  const rows = [
    poll("old-draft", "draft", "2026-09-01T10:00:00.000Z"),
    poll("other-new", "open", "2026-10-04T10:00:00.000Z", "other"),
    poll("middle-open", "open", "2026-10-02T10:00:00.000Z"),
    poll("new-closed", "closed", "2026-10-03T10:00:00.000Z"),
    poll("new-draft", "draft", "2026-10-04T10:00:00.000Z")
  ];
  const snapshot = structuredClone(rows);
  for (const [filter, expected] of Object.entries({
    active: ["new-draft", "middle-open", "old-draft"], draft: ["new-draft", "old-draft"],
    open: ["middle-open"], closed: ["new-closed"]
  })) assert.deepEqual(select(rows, "owner", query({ filter })).map(({ id }) => id), expected);
  assert.deepEqual(select(rows, "nobody", query()), []);
  assert.deepEqual(select(rows, "owner", query({ pageSize: 1 })).map(({ id }) => id),
    ["new-draft", "middle-open", "old-draft"], "pure selection does not truncate a database page");
  assert.deepEqual(rows, snapshot);
});

test("title matching supports exact/partial normalized titles and preserves accents/punctuation", () => {
  const matches = helper(domain, "matchesOwnedPollQuery");
  const row = { ...poll("p", "open", "2026-10-04T10:00:00.000Z"), title: "  Café\tAutumn get-together  ", description: "Winter dinner" };
  for (const search of [row.title, "CAFÉ AUTUMN GET-TOGETHER", "cafe\u0301   autumn", "get-together", "", "  "]) {
    assert.equal(matches(row, "owner", query({ search })), true, search);
  }
  for (const search of ["cafe", "get together", "Winter", "caf.*", "zzz"]) {
    assert.equal(matches(row, "owner", query({ search })), false, search);
  }
  assert.equal(matches(row, "other", query({ search: row.title })), false);
  assert.equal(matches({ ...row, status: "active" }, "owner", query()), false);
  assert.equal(matches({ ...row, status: "archived" }, "owner", query()), false);
});

test("equal creation instants use descending ordinal ID as the documented implementation choice", () => {
  const compare = helper(domain, "comparePollCreation");
  const timestamp = "2026-10-04T10:00:00.000Z";
  const rows = [poll("a", "draft", timestamp), poll("Z", "open", timestamp), poll("z", "open", timestamp)];
  assert.deepEqual([...rows].sort(compare).map(({ id }) => id), ["z", "a", "Z"]);
  assert.equal(compare(rows[0], rows[0]), 0);
});

// MP-US-03: preserve choice order and repeated-hour offsets; project only allowed summary fields.
test("summary projection preserves dates/creation and omits private poll and response data", () => {
  const summarize = helper(domain, "toOwnedPollSummary");
  const row = {
    ...poll("p", "open", "2026-10-04T00:30:00.000Z"), publicTokenHash: "secret", selectedDateId: "d1",
    proposedDates: [
      { kind: "date", localDate: "2026-10-25" },
      { kind: "date-time", localDateTime: "2026-10-25T01:30", utcOffset: "+01:00", timeZone: "Europe/London", utcInstant: "2026-10-25T00:30:00.000Z" },
      { kind: "date-time", localDateTime: "2026-10-25T01:30", utcOffset: "+00:00", timeZone: "Europe/London", utcInstant: "2026-10-25T01:30:00.000Z" }
    ]
  };
  const snapshot = structuredClone(row);
  const summary = summarize(row, 3);
  assert.deepEqual(summary, {
    id: row.id, title: row.title, status: "open", createdAt: row.createdAt, timeZone: row.timeZone, participantCount: 3,
    proposedDates: [
      { kind: "date", localDate: "2026-10-25" },
      { kind: "date-time", localDateTime: "2026-10-25T01:30", utcOffset: "+01:00" },
      { kind: "date-time", localDateTime: "2026-10-25T01:30", utcOffset: "+00:00" }
    ]
  });
  assert.equal(contracts.ownedPollSummarySchema.safeParse(summary).success, true);
  summary.proposedDates[0].localDate = "2026-12-01";
  assert.deepEqual(row, snapshot, "summary dates are detached from stored dates");
  const incomplete = summarize(poll("draft", "draft", row.createdAt), 0);
  assert.deepEqual(incomplete.proposedDates, []);
  assert.equal(incomplete.participantCount, 0);
  assert.equal(contracts.ownedPollSummarySchema.safeParse(incomplete).success, true);
  for (const count of [-1, 1.5, undefined]) assert.throws(() => summarize(row, count), /summary/i);
  assert.throws(() => summarize({ ...row, status: "active" }, 0), /summary/i);
});
