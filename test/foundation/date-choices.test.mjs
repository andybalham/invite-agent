import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const domainUrl = pathToFileURL(path.join(repositoryRoot, "backend/dist/domain/index.js")).href;

async function loadDomain() {
  return import(domainUrl);
}

test("date-only choices retain their local ISO date", async () => {
  const { resolveProposedDate } = await loadDomain();

  assert.deepEqual(resolveProposedDate({ kind: "date", localDate: "2026-10-17" }, "Europe/London"), {
    success: true,
    data: { kind: "date", localDate: "2026-10-17" }
  });
});

test("timed choices retain the UTC instant, IANA zone, and selected offset", async () => {
  const { resolveProposedDate } = await loadDomain();

  assert.deepEqual(
    resolveProposedDate(
      { kind: "date-time", localDateTime: "2026-10-17T18:00" },
      "Europe/London"
    ),
    {
      success: true,
      data: {
        kind: "date-time",
        localDateTime: "2026-10-17T18:00",
        utcInstant: "2026-10-17T17:00:00.000Z",
        timeZone: "Europe/London",
        utcOffset: "+01:00"
      }
    }
  );
});

test("DST gaps are rejected and folds require an explicit valid offset", async () => {
  const { resolveProposedDate } = await loadDomain();

  const gap = resolveProposedDate(
    { kind: "date-time", localDateTime: "2026-03-29T01:30" },
    "Europe/London"
  );
  assert.equal(gap.success, false);
  assert.equal(gap.issue.code, "DATE_TIME_NONEXISTENT");

  const fold = resolveProposedDate(
    { kind: "date-time", localDateTime: "2026-10-25T01:30" },
    "Europe/London"
  );
  assert.equal(fold.success, false);
  assert.equal(fold.issue.code, "DATE_TIME_AMBIGUOUS");
  assert.deepEqual(fold.issue.validOffsets, ["+01:00", "+00:00"]);

  assert.equal(
    resolveProposedDate(
      { kind: "date-time", localDateTime: "2026-10-25T01:30", utcOffset: "+01:00" },
      "Europe/London"
    ).data.utcInstant,
    "2026-10-25T00:30:00.000Z"
  );
  assert.equal(
    resolveProposedDate(
      { kind: "date-time", localDateTime: "2026-10-25T01:30", utcOffset: "+00:00" },
      "Europe/London"
    ).data.utcInstant,
    "2026-10-25T01:30:00.000Z"
  );
});

test("resolved choices have a stable duplicate key across a deterministic date sample", async () => {
  const { proposedDateKey, resolveProposedDate } = await loadDomain();
  let previous;

  for (let day = 1; day <= 28; day += 1) {
    const localDate = `2026-11-${String(day).padStart(2, "0")}`;
    const resolved = resolveProposedDate({ kind: "date", localDate }, "Europe/London");
    assert.equal(resolved.success, true);
    const key = proposedDateKey(resolved.data);
    assert.notEqual(key, previous);
    assert.equal(key, proposedDateKey(structuredClone(resolved.data)));
    previous = key;
  }
});
