export const validCreatePollRequest = Object.freeze({
  title: "Autumn planning session",
  timeZone: "Europe/London",
  proposedDates: [
    Object.freeze({ kind: "date", localDate: "2026-10-12" }),
    Object.freeze({ kind: "date", localDate: "2026-10-13" })
  ]
});

export const validPublicPollResponse = Object.freeze({
  id: "poll_fixture_open",
  title: "Autumn planning session",
  status: "open",
  version: 3,
  timeZone: "Europe/London",
  proposedDates: [
    Object.freeze({ id: "date_1", kind: "date", localDate: "2026-10-12" })
  ],
  participants: [
    Object.freeze({
      id: "participant_alice",
      displayName: "Alice",
      availability: Object.freeze({ date_1: "yes" })
    })
  ],
  ranking: [Object.freeze({ choiceId: "date_1", yesTotal: 1 })]
});

export const stableErrorStatuses = Object.freeze({
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  LINK_REVOKED: 410,
  INVALID_LIFECYCLE: 422,
  RATE_LIMITED: 429
});
