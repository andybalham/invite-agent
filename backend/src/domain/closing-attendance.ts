import type { Availability } from "@invite-a-gent/contracts";

export interface ClosingParticipant {
  readonly displayName: string;
  readonly availability: Readonly<Record<string, Availability>>;
}

export interface ClosingAttendance {
  readonly selectedDateId: string;
  readonly yes: string[];
  readonly no: string[];
}

export function projectClosingAttendance(
  selectedDateId: string,
  participants: readonly ClosingParticipant[]
): ClosingAttendance {
  return {
    selectedDateId,
    yes: participants
      .filter(({ availability }) => availability[selectedDateId] === "yes")
      .map(({ displayName }) => displayName),
    no: participants
      .filter(({ availability }) => availability[selectedDateId] !== "yes")
      .map(({ displayName }) => displayName)
  };
}
