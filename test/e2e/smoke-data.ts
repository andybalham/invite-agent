import type { ProposedDateInput } from "@invite-a-gent/contracts";

// Fixed contract inputs; identities are captured from responses, never seeded in DynamoDB.
export const smokeData = {
  description: "Choose every date you could attend.",
  instructions: "Please respond by Friday.",
  location: "**Community Hall** — [map](https://example.test/map)",
  openLocation: "**Riverside Room** — [map](https://example.test/map)",
  unsafeLocation: "[bad](javascript:alert(1))",
  timeZone: "Europe/London",
  dates: [
    { kind: "date", localDate: "2026-10-10" },
    { kind: "date-time", localDateTime: "2026-10-17T18:00" },
    { kind: "date-time", localDateTime: "2026-10-24T18:00" }
  ] satisfies ProposedDateInput[],
  labels: ["Sat 10 Oct", "Sat 17 Oct 18:00", "Sat 24 Oct 18:00"],
  dashboardLabels: ["Sat, 10 Oct 2026", "Sat, 17 Oct 2026, 18:00 · Europe/London · UTC+01:00", "Sat, 24 Oct 2026, 18:00 · Europe/London · UTC+01:00"],
  matrix: { Alice: ["yes", "yes", "no"], Bob: ["yes", "yes", "no"], Charlie: ["no", "yes", "yes"] }
} as const;
