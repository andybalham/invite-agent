import type { Availability } from "@invite-a-gent/contracts";

export const MAX_RANKED_CHOICES = 5;

export interface RankingParticipant {
  readonly availability: Readonly<Record<string, Availability>>;
}

export interface RankingEntry {
  readonly choiceId: string;
  readonly yesTotal: number;
}

export function calculateTopFiveRanking(
  choiceIds: readonly string[],
  participants: readonly RankingParticipant[]
): RankingEntry[] {
  return choiceIds
    .map((choiceId, originalIndex) => ({
      choiceId,
      yesTotal: participants.reduce(
        (total, participant) =>
          total + (participant.availability[choiceId] === "yes" ? 1 : 0),
        0
      ),
      originalIndex
    }))
    .sort(
      (left, right) =>
        right.yesTotal - left.yesTotal || left.originalIndex - right.originalIndex
    )
    .slice(0, MAX_RANKED_CHOICES)
    .map(({ choiceId, yesTotal }) => ({ choiceId, yesTotal }));
}
