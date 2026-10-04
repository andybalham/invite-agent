import {
  normalizeDashboardTitle,
  ownedPollSummarySchema,
  type OwnedPollSummary,
  type ResolvedOwnedPollListQuery
} from "@invite-a-gent/contracts";
import type { PollRecord } from "../data/types.js";

type QueryCandidate = Pick<PollRecord, "organiserId" | "status" | "title">;
type CreationCandidate = Pick<PollRecord, "createdAt" | "id">;

/** The organiser ID must come from verified authentication, never from the list request. */
export function matchesOwnedPollQuery(
  poll: QueryCandidate,
  organiserId: string,
  query: ResolvedOwnedPollListQuery
): boolean {
  if (poll.organiserId !== organiserId) return false;
  if (poll.status !== "draft" && poll.status !== "open" && poll.status !== "closed") return false;
  const inFilter = query.filter === "active"
    ? poll.status === "draft" || poll.status === "open"
    : poll.status === query.filter;
  return inFilter && normalizeDashboardTitle(poll.title).includes(query.search);
}

/** Canonical UTC creation timestamps and ordinal IDs mirror descending GSI1 sort keys. */
export function comparePollCreation(left: CreationCandidate, right: CreationCandidate): number {
  if (left.createdAt !== right.createdAt) return left.createdAt > right.createdAt ? -1 : 1;
  return left.id === right.id ? 0 : left.id > right.id ? -1 : 1;
}

/** Select every supplied candidate. Repository continuation/budgets are deliberately separate. */
export function selectOwnedPolls<T extends QueryCandidate & CreationCandidate>(
  polls: readonly T[],
  organiserId: string,
  query: ResolvedOwnedPollListQuery
): T[] {
  return polls.filter((poll) => matchesOwnedPollQuery(poll, organiserId, query)).sort(comparePollCreation);
}

/** Project detached display choices; participantCount must be complete, never inferred here. */
export function toOwnedPollSummary(poll: PollRecord, participantCount: number): OwnedPollSummary {
  const summary: OwnedPollSummary = {
    id: poll.id,
    title: poll.title,
    status: poll.status,
    createdAt: poll.createdAt,
    timeZone: poll.timeZone,
    proposedDates: poll.proposedDates.map((choice) => choice.kind === "date"
      ? { kind: "date", localDate: choice.localDate }
      : { kind: "date-time", localDateTime: choice.localDateTime, utcOffset: choice.utcOffset }),
    participantCount
  };
  const parsed = ownedPollSummarySchema.safeParse(summary);
  if (!parsed.success) throw new Error(parsed.issues.join("; "));
  return parsed.data;
}
