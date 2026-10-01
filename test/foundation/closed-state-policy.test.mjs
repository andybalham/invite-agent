import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const applicationUrl = pathToFileURL(path.join(root, "backend/dist/application/index.js")).href;

const closedPoll = {
  id: "poll-closed-policy",
  organiserId: "organiser-owner",
  title: "Closed policy",
  status: "closed",
  version: 7,
  timeZone: "Europe/London",
  proposedDates: [
    { kind: "date", localDate: "2026-10-10" },
    { kind: "date", localDate: "2026-10-17" }
  ],
  selectedDateId: "poll-closed-policy-date-2",
  frozenRanking: [
    { choiceId: "poll-closed-policy-date-1", yesTotal: 2 },
    { choiceId: "poll-closed-policy-date-2", yesTotal: 1 }
  ],
  createdAt: "2026-10-01T12:00:00.000Z"
};

// S-022 / US-26: lifecycle policy must reject organiser date writes before persistence.
test("closed lifecycle rejects proposed-date replacement with 422 and no repository write", async () => {
  const { PollService } = await import(applicationUrl);
  let updateCalls = 0;
  const repository = {
    getPoll: async () => structuredClone(closedPoll),
    updatePoll: async () => { updateCalls += 1; }
  };
  const service = new PollService(repository, {
    baseUrl: "http://127.0.0.1:15173",
    tokenHashKey: "closed-state-policy-key"
  });

  let rejection;
  try {
    await service.update(
      closedPoll.id,
      {
        title: closedPoll.title,
        timeZone: closedPoll.timeZone,
        proposedDates: [
          ...closedPoll.proposedDates,
          { kind: "date", localDate: "2026-10-24" }
        ]
      },
      closedPoll.organiserId
    );
  } catch (error) {
    rejection = error;
  }

  assert.deepEqual(
    { code: rejection?.code, status: rejection?.status, updateCalls },
    { code: "INVALID_LIFECYCLE", status: 422, updateCalls: 0 }
  );
});
