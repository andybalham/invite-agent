import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const domainUrl = pathToFileURL(path.join(repositoryRoot, "backend/dist/domain/index.js")).href;

async function loadDomain() {
  return import(domainUrl);
}

test("publication readiness identifies every blocking field without mutating the draft", async () => {
  const { validateDraftPublication } = await loadDomain();
  const input = Object.freeze({
    title: " ",
    timeZone: "Europe/London",
    location: "[unsafe](javascript:alert(1))",
    proposedDates: []
  });

  const result = validateDraftPublication(input);
  assert.equal(result.success, false);
  assert.equal(result.input, input);
  assert.deepEqual(result.issues.map(({ field }) => field), ["title", "proposedDates", "location"]);
  assert.deepEqual(result.issues.map(({ message }) => message), [
    "Add a title.",
    "Add at least two proposed dates.",
    "Location: Use secure HTTPS links only"
  ]);
});

test("publication readiness distinguishes one choice, duplicates, and valid drafts", async () => {
  const { validateDraftPublication } = await loadDomain();
  const base = { title: "Autumn get-together", timeZone: "Europe/London" };
  const first = { kind: "date", localDate: "2026-10-10" };
  const second = { kind: "date-time", localDateTime: "2026-10-17T18:00" };

  assert.deepEqual(
    validateDraftPublication({ ...base, proposedDates: [first] }).issues.map(({ message }) => message),
    ["Add at least one more proposed date (minimum two)."]
  );
  assert.deepEqual(
    validateDraftPublication({ ...base, proposedDates: [first, { ...first }] }).issues.map(
      ({ message }) => message
    ),
    ["Date 2 is the same as date 1."]
  );
  assert.deepEqual(validateDraftPublication({ ...base, proposedDates: [first, second] }), {
    success: true,
    data: { ...base, proposedDates: [first, second] }
  });
});
