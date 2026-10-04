import assert from "node:assert/strict";
import test from "node:test";
import * as contracts from "../../packages/contracts/dist/index.js";
import { ApplicationError } from "../../backend/dist/application/errors.js";

const cursor = `v1.eyJrZXkiOiJjcmVhdGlvbiJ9.${"a".repeat(43)}`;
const summary = {
  id: "poll-1", title: "Autumn dinner", status: "draft",
  createdAt: "2026-10-04T00:30:00.000Z", timeZone: "Europe/London",
  proposedDates: [], participantCount: 0
};

function schema(name) {
  assert.equal(typeof contracts[name]?.safeParse, "function", `${name} must be exported`);
  return contracts[name];
}

// S-043 / MP-US-02,05,06: transport converts canonical URL numbers before shared validation.
test("owned-list request validates filters, bounded search, page sizes and opaque cursor shape", () => {
  const request = schema("ownedPollListRequestSchema");
  for (const input of [{}, { search: "" }, ...["active", "draft", "open", "closed"].map((filter) => ({ filter })),
    { search: "😀".repeat(200), pageSize: 1 }, { search: "Autumn", pageSize: 50, cursor }]) {
    assert.equal(request.safeParse(input).success, true, JSON.stringify(input));
  }
  for (const input of [null, [], "active", { filter: "Active" }, { filter: "archived" },
    { filter: null }, { search: 1 }, { search: "😀".repeat(201) },
    ...[0, -1, 51, 1.5, NaN, Infinity, "25", null].map((pageSize) => ({ pageSize })),
    ...["", "offset-25", `${cursor}\n`, ` ${cursor}`, "v2.e30." + "a".repeat(43), "v1.e30.short", "v1.e30=." + "a".repeat(43),
      `v1.${"a".repeat(2048)}.${"a".repeat(43)}`, 25].map((cursor) => ({ cursor })),
    { organiserId: "other" }, { ownerId: "other" }, { sort: "updatedAt" }]) {
    assert.equal(request.safeParse(input).success, false, JSON.stringify(input));
  }
});

// MP-US-03,04: no capability or participant details in the summary shape.
test("owned summaries require safe fields and preserve draft/date representations", () => {
  const response = schema("ownedPollSummarySchema");
  assert.equal(response.safeParse(summary).success, true);
  const proposedDates = [
    { kind: "date", localDate: "2026-10-25" },
    { kind: "date-time", localDateTime: "2026-10-25T01:30", utcOffset: "+01:00" },
    { kind: "date-time", localDateTime: "2026-10-25T01:30", utcOffset: "+00:00" }
  ];
  for (const status of ["draft", "open", "closed"]) {
    const value = { ...summary, status, participantCount: 3, proposedDates };
    assert.deepEqual(response.safeParse(value), { success: true, data: value });
  }
  for (const key of Object.keys(summary)) {
    const value = { ...summary };
    delete value[key];
    assert.equal(response.safeParse(value).success, false, `missing ${key}`);
  }
  for (const value of [
    { ...summary, id: " " }, { ...summary, title: "" }, { ...summary, status: "active" },
    { ...summary, status: "archived" }, { ...summary, timeZone: "Invalid/Zone" },
    ...["yesterday", "2026-02-30T00:00:00.000Z", "2026-10-04", "2026-10-04T01:30:00+01:00"].map((createdAt) => ({ ...summary, createdAt })),
    ...[-1, 0.5, "0", NaN, Number.MAX_SAFE_INTEGER + 1].map((participantCount) => ({ ...summary, participantCount })),
    { ...summary, proposedDates: [{ kind: "date", localDate: "2026-02-30" }] },
    { ...summary, proposedDates: [{ kind: "date-time", localDateTime: "2026-10-25T25:00" }] },
    ...["publicToken", "publicTokenHash", "publicUrl", "organiserId", "participants", "ranking", "version"].map((key) => ({ ...summary, [key]: "private" }))
  ]) assert.equal(response.safeParse(value).success, false, JSON.stringify(value));
});

test("owned-list pages allow empty continuations but reject extra data and oversized pages", () => {
  const page = schema("ownedPollListResponseSchema");
  for (const value of [{ items: [] }, { items: [], nextCursor: cursor }, { items: [summary], nextCursor: cursor },
    { items: Array.from({ length: 50 }, (_, i) => ({ ...summary, id: `poll-${i}` })) }]) {
    assert.equal(page.safeParse(value).success, true);
  }
  for (const value of [{}, { items: "poll" }, { items: [{}] }, { items: [], total: 0 },
    { items: [], nextCursor: "" }, { items: Array(51).fill(summary) }]) {
    assert.equal(page.safeParse(value).success, false);
  }
});

test("dashboard error envelope preserves existing codes/statuses and internal HTTP failures", () => {
  const envelope = schema("ownedPollListErrorResponseSchema");
  assert.deepEqual(contracts.LIFECYCLE_STATES, ["draft", "open", "closed"]);
  assert.deepEqual(contracts.API_ERROR_STATUS, {
    VALIDATION_ERROR: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404,
    CONFLICT: 409, LINK_REVOKED: 410, INVALID_LIFECYCLE: 422, RATE_LIMITED: 429
  });
  for (const [code, status] of Object.entries(contracts.API_ERROR_STATUS)) {
    const error = new ApplicationError(code, "Dashboard failure");
    assert.equal(error.status, status);
    assert.equal(envelope.safeParse({ error: { code, message: error.message } }).success, true);
    assert.equal(contracts.apiErrorSchema.safeParse({ code, status, message: error.message }).success, true);
  }
  assert.equal(envelope.safeParse({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred", correlationId: "request-1" } }).success, true);
  for (const value of [{ code: "UNAUTHENTICATED", message: "Sign in" },
    { error: { code: "CURSOR_INVALID", message: "Invalid" } },
    { error: { code: "VALIDATION_ERROR", message: "" } },
    { error: { code: "VALIDATION_ERROR", message: "Invalid", status: 400 } },
    { error: { code: "INTERNAL_ERROR", message: "Failed", correlationId: "" } }]) {
    assert.equal(envelope.safeParse(value).success, false);
  }
});
