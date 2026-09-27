import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validCreatePollRequest } from "../fixtures/contracts.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const validatorUrl = pathToFileURL(
  path.join(repositoryRoot, "backend/dist/domain/validate-create-poll-request.js")
).href;

test("backend validates valid requests at its own boundary", async () => {
  const { validateCreatePollRequest } = await import(validatorUrl);

  assert.equal(validateCreatePollRequest(validCreatePollRequest).success, true);
});

test("backend rejects invalid data even if a client attempted to submit it", async () => {
  const { validateCreatePollRequest } = await import(validatorUrl);
  const invalidRequest = { ...validCreatePollRequest, title: "", organiserId: "spoofed" };

  assert.equal(validateCreatePollRequest(invalidRequest).success, false);
});
