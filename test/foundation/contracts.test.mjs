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
