import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  stableErrorStatuses,
  validCreatePollRequest,
  validPublicPollResponse
} from "../fixtures/contracts.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contractsUrl = pathToFileURL(
  path.join(repositoryRoot, "packages/contracts/dist/index.js")
).href;

async function loadContracts() {
  try {
    return await import(contractsUrl);
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") {
      assert.fail(
        "the built @invite-a-gent/contracts entry point is absent; implement the shared schemas before making this test green"
      );
    }
    throw error;
  }
}

function expectSchema(schema, exportName) {
  assert.equal(typeof schema?.safeParse, "function", `${exportName} must expose safeParse`);
  return schema;
}

test("lifecycle states accept only draft, open, and closed", async () => {
  const contracts = await loadContracts();
  const schema = expectSchema(contracts.lifecycleStateSchema, "lifecycleStateSchema");

  for (const state of ["draft", "open", "closed"]) {
    assert.equal(schema.safeParse(state).success, true, `${state} must be accepted`);
  }
  for (const state of ["", "published", "deleted", "OPEN", null]) {
    assert.equal(schema.safeParse(state).success, false, `${String(state)} must be rejected`);
  }
});

test("availability accepts only yes and no", async () => {
  const contracts = await loadContracts();
  const schema = expectSchema(contracts.availabilitySchema, "availabilitySchema");

  for (const value of ["yes", "no"]) {
    assert.equal(schema.safeParse(value).success, true, `${value} must be accepted`);
  }
  for (const value of ["maybe", "", true, 1, null]) {
    assert.equal(schema.safeParse(value).success, false, `${String(value)} must be rejected`);
  }
});

test("request and response DTO schemas accept deterministic valid fixtures", async () => {
  const contracts = await loadContracts();
  const requestSchema = expectSchema(contracts.createPollRequestSchema, "createPollRequestSchema");
  const responseSchema = expectSchema(contracts.publicPollResponseSchema, "publicPollResponseSchema");

  assert.equal(requestSchema.safeParse(validCreatePollRequest).success, true);
  assert.equal(responseSchema.safeParse(validPublicPollResponse).success, true);
});

test("DTO schemas reject invalid client data rather than relying on frontend checks", async () => {
  const contracts = await loadContracts();
  const requestSchema = expectSchema(contracts.createPollRequestSchema, "createPollRequestSchema");
  const responseSchema = expectSchema(contracts.publicPollResponseSchema, "publicPollResponseSchema");

  assert.equal(
    requestSchema.safeParse({ ...validCreatePollRequest, title: "", organiserId: "spoofed" }).success,
    false,
    "the shared request schema must reject invalid or server-authoritative fields"
  );
  assert.equal(
    responseSchema.safeParse({ ...validPublicPollResponse, status: "deleted" }).success,
    false
  );
});

test("stable machine-readable error codes map to their specified HTTP statuses", async () => {
  const contracts = await loadContracts();
  const errorSchema = expectSchema(contracts.apiErrorSchema, "apiErrorSchema");

  assert.deepEqual(contracts.API_ERROR_STATUS, stableErrorStatuses);
  for (const [code, status] of Object.entries(stableErrorStatuses)) {
    assert.equal(
      errorSchema.safeParse({ code, status, message: "Semantic test message" }).success,
      true,
      `${code} must be a valid API error`
    );
  }
  assert.equal(
    errorSchema.safeParse({ code: "INTERNAL_STACK_TRACE", status: 500, message: "details" }).success,
    false
  );
});

test("audit history contract accepts complete redacted pages and rejects security-bearing fields", async () => {
  const contracts = await loadContracts();
  const schema = expectSchema(contracts.auditHistoryPageSchema, "auditHistoryPageSchema");
  const page = {
    items: [{
      id: "event-2",
      revision: 2,
      entity: { type: "participant", id: "participant-1" },
      action: "PARTICIPANT_ADDED",
      summary: "Added participant Alice",
      before: null,
      after: { displayName: "Alice", availability: { "date-1": "no" } },
      occurredAt: "2026-09-29T09:30:00.000Z",
      actor: { category: "anonymous-link-holder" }
    }],
    nextCursor: "opaque-cursor",
    total: 2
  };
  assert.equal(schema.safeParse(page).success, true);
  for (const forbidden of ["token", "cookie", "sessionId", "authorization", "requestBody"]) {
    assert.equal(
      schema.safeParse({ ...page, items: [{ ...page.items[0], [forbidden]: "secret" }] }).success,
      false,
      `${forbidden} must never be part of the audit contract`
    );
  }
});

test("undo contracts require an explicit confirmation and a linked compensating event", async () => {
  const contracts = await loadContracts();
  const confirmation = expectSchema(contracts.confirmUndoRequestSchema, "confirmUndoRequestSchema");
  const preview = expectSchema(contracts.undoPreviewSchema, "undoPreviewSchema");
  const result = expectSchema(contracts.undoResultSchema, "undoResultSchema");
  assert.equal(confirmation.safeParse({ confirmed: true }).success, true);
  assert.equal(confirmation.safeParse({ confirmed: false }).success, false);
  assert.equal(preview.safeParse({
    eventId: "event-3", revision: 3, action: "PARTICIPANT_ADDED",
    summary: "Remove participant Alice", restoredBefore: { displayName: "Alice" },
    restoredAfter: null, requiresConfirmation: true, wouldOverwrite: false
  }).success, true);
  assert.equal(preview.safeParse({
    eventId: "event-3", revision: 3, action: "AVAILABILITY_CHANGED",
    summary: "Restore availability to No", restoredBefore: { value: "no" },
    restoredAfter: { value: "no" }, requiresConfirmation: true, wouldOverwrite: true,
    warning: "A later change already set Alice · Sat 10 Oct to No. Undoing sets it to No and overwrites that newer value."
  }).success, true);
  assert.equal(preview.safeParse({
    eventId: "event-3", revision: 3, action: "AVAILABILITY_CHANGED",
    summary: "Restore availability to No", restoredBefore: { value: "no" },
    restoredAfter: { value: "no" }, requiresConfirmation: true, wouldOverwrite: true
  }).success, false, "overwrite previews identify the risk with actionable copy");
  const undoEvent = {
    id: "event-4", revision: 4, entity: { type: "participant", id: "participant-1" },
    action: "UNDO", summary: "Undo #3: restored participant", before: { displayName: "Alice" },
    after: null, occurredAt: "2026-09-29T09:31:00.000Z",
    actor: { category: "organiser", subject: "organiser-1" },
    undoOf: { id: "event-3", revision: 3 }
  };
  assert.equal(result.safeParse({ poll: validPublicPollResponse, event: undoEvent }).success, true);
  assert.equal(result.safeParse({ poll: validPublicPollResponse, event: { ...undoEvent, undoOf: undefined } }).success, false);
});

test("close contracts require one proposed date and explicit confirmation", async () => {
  const contracts = await loadContracts();
  const request = expectSchema(contracts.closePollRequestSchema, "closePollRequestSchema");
  const result = expectSchema(contracts.closePollResultSchema, "closePollResultSchema");
  const closedPoll = {
    ...validPublicPollResponse,
    status: "closed",
    selectedDateId: "date_1",
    ranking: [{ choiceId: "date_1", yesTotal: 1 }]
  };

  assert.equal(request.safeParse({ selectedDateId: "date_1", confirmed: true }).success, true);
  assert.equal(request.safeParse({ selectedDateId: "date_1", confirmed: false }).success, false);
  assert.equal(request.safeParse({ selectedDateId: "date_1", confirmed: true, token: "secret" }).success, false);
  assert.equal(result.safeParse({ poll: closedPoll }).success, true);
  assert.equal(result.safeParse({ poll: { ...closedPoll, selectedDateId: undefined } }).success, false);
});
