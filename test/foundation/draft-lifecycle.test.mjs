import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validCreatePollRequest } from "../fixtures/contracts.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const domainUrl = pathToFileURL(path.join(repositoryRoot, "backend/dist/domain/index.js")).href;

async function loadDomain() {
  return import(domainUrl);
}

test("a draft requires a non-blank title and valid IANA time zone", async () => {
  const { validateDraftPoll } = await loadDomain();

  for (const title of ["", " ", "\n\t"]) {
    const input = { ...validCreatePollRequest, title };
    const result = validateDraftPoll(input);
    assert.equal(result.success, false);
    assert.equal(result.input, input, "recoverable input must be preserved by reference");
    assert.deepEqual(result.issues.map(({ code }) => code), ["TITLE_REQUIRED"]);
  }

  for (const timeZone of ["Not/A_Zone", "Europe/Nowhere", "", "UTC+01:00"]) {
    const input = { ...validCreatePollRequest, timeZone };
    const result = validateDraftPoll(input);
    assert.equal(result.success, false);
    assert.equal(result.input, input);
    assert.deepEqual(result.issues.map(({ code }) => code), ["TIME_ZONE_INVALID"]);
  }
});

test("a valid draft permits empty optional fields and fewer than two choices", async () => {
  const { validateDraftPoll } = await loadDomain();
  const input = {
    title: "Planning session",
    timeZone: "Europe/London",
    description: "",
    instructions: "",
    location: "",
    proposedDates: []
  };

  assert.deepEqual(validateDraftPoll(input), { success: true, data: input });
});

test("publication requires at least two distinct valid choices", async () => {
  const { validatePublicationReadiness } = await loadDomain();
  const first = { kind: "date", localDate: "2026-10-12" };
  const second = { kind: "date", localDate: "2026-10-13" };

  assert.deepEqual(validatePublicationReadiness([]).issues.map(({ code }) => code), [
    "CHOICES_MINIMUM"
  ]);
  assert.deepEqual(validatePublicationReadiness([first]).issues.map(({ code }) => code), [
    "CHOICES_MINIMUM"
  ]);
  assert.deepEqual(validatePublicationReadiness([first, { ...first }]).issues.map(({ code }) => code), [
    "CHOICES_DUPLICATE"
  ]);
  assert.deepEqual(
    validatePublicationReadiness([first, { kind: "date", localDate: "2026-02-30" }]).issues.map(
      ({ code }) => code
    ),
    ["CHOICES_INVALID"]
  );
  assert.deepEqual(
    validatePublicationReadiness([
      first,
      { kind: "date-time", localDateTime: "2026-10-13T25:00" }
    ]).issues.map(({ code }) => code),
    ["CHOICES_INVALID"]
  );
  assert.deepEqual(validatePublicationReadiness([first, second]), {
    success: true,
    data: [first, second]
  });
});

test("lifecycle transitions allow draft to open, open to closed, and closed to open", async () => {
  const { transitionLifecycle } = await loadDomain();

  assert.deepEqual(transitionLifecycle("draft", "open"), { success: true, data: "open" });
  assert.deepEqual(transitionLifecycle("open", "closed"), { success: true, data: "closed" });
  assert.deepEqual(transitionLifecycle("closed", "open"), { success: true, data: "open" });
});

test("all other lifecycle transitions fail with a stable non-sensitive error", async () => {
  const { transitionLifecycle } = await loadDomain();
  const invalidTransitions = [
    ["draft", "draft"],
    ["draft", "closed"],
    ["open", "draft"],
    ["open", "open"],
    ["closed", "draft"],
    ["closed", "closed"]
  ];

  for (const [current, target] of invalidTransitions) {
    assert.deepEqual(transitionLifecycle(current, target), {
      success: false,
      input: { current, target },
      error: {
        code: "INVALID_LIFECYCLE",
        message: `Cannot move a poll from ${current} to ${target}`
      }
    });
  }
});
