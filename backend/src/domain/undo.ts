import type { AuditEvent, ParticipantRecord } from "../data/types.js";
import { validateParticipantName } from "./participant-name.js";

type ReversibleEvent = Pick<AuditEvent, "action" | "entityId" | "before" | "after">;

export type IsolatedUndoPlan = {
  readonly operation: "create" | "replace" | "delete";
  readonly participant: ParticipantRecord;
  readonly auditBefore: unknown;
  readonly auditAfter: unknown;
  readonly wouldOverwrite: boolean;
  readonly warning?: string;
};

export class UndoPlanError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "UndoPlanError";
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new UndoPlanError(`The selected ${label} snapshot is invalid.`);
  }
  return value as Record<string, unknown>;
}

function sameAvailability(
  actual: Readonly<Record<string, string>>,
  expected: unknown
): boolean {
  const snapshot = record(expected, "participant");
  const availability = record(snapshot.availability, "availability");
  return Object.keys(actual).length === Object.keys(availability).length &&
    Object.entries(actual).every(([key, value]) => availability[key] === value);
}

export function planIsolatedUndo(
  event: ReversibleEvent,
  current: ParticipantRecord | undefined,
  context: { readonly pollId: string; readonly occurredAt: string } = {
    pollId: current?.pollId ?? "",
    occurredAt: new Date().toISOString()
  }
): IsolatedUndoPlan {
  if (event.action === "AVAILABILITY_CHANGED") {
    if (!current) throw new UndoPlanError("The affected participant no longer exists.");
    const separator = event.entityId.lastIndexOf(":");
    const participantId = event.entityId.slice(0, separator);
    const dateId = event.entityId.slice(separator + 1);
    const before = record(event.before, "before");
    const after = record(event.after, "after");
    if (separator < 1 || participantId !== current.id ||
      (before.value !== "yes" && before.value !== "no") ||
      (after.value !== "yes" && after.value !== "no") ||
      (current.availability[dateId] !== "yes" && current.availability[dateId] !== "no")) {
      throw new UndoPlanError("The selected availability snapshot is invalid.");
    }
    const currentValue = current.availability[dateId];
    const wouldOverwrite = currentValue !== after.value;
    return {
      operation: "replace",
      participant: {
        ...current,
        availability: { ...current.availability, [dateId]: before.value as "yes" | "no" },
        updatedAt: context.occurredAt
      },
      auditBefore: { value: currentValue },
      auditAfter: event.before,
      wouldOverwrite,
      ...(wouldOverwrite
        ? { warning: `A later change already set ${current.displayName} · ${dateId} to ${currentValue === "yes" ? "Yes" : "No"}. Undoing sets it to ${before.value === "yes" ? "Yes" : "No"} and overwrites that newer value.` }
        : {})
    };
  }

  if (event.action === "PARTICIPANT_RENAMED") {
    if (!current) throw new UndoPlanError("The affected participant no longer exists.");
    const before = record(event.before, "before");
    const after = record(event.after, "after");
    if (current.id !== event.entityId || typeof after.displayName !== "string") {
      throw new UndoPlanError("The selected participant snapshot is invalid.");
    }
    const restored = validateParticipantName(before.displayName);
    if (!restored.success) throw new UndoPlanError("The previous participant name is invalid.");
    const wouldOverwrite = current.displayName !== after.displayName;
    return {
      operation: "replace",
      participant: {
        ...current,
        displayName: restored.displayName,
        normalizedName: restored.normalizedName,
        updatedAt: context.occurredAt
      },
      auditBefore: { displayName: current.displayName },
      auditAfter: event.before,
      wouldOverwrite,
      ...(wouldOverwrite
        ? { warning: `A later change already renamed this participant to ${current.displayName}. Undoing restores ${restored.displayName} and overwrites that newer value.` }
        : {})
    };
  }

  if (event.action === "PARTICIPANT_ADDED") {
    if (!current) throw new UndoPlanError("Nothing to undo — that participant is already absent.");
    const after = record(event.after, "after");
    if (current.id !== event.entityId || typeof after.displayName !== "string") {
      throw new UndoPlanError("The selected participant snapshot is invalid.");
    }
    const wouldOverwrite = current.displayName !== after.displayName ||
      !sameAvailability(current.availability, event.after);
    return {
      operation: "delete",
      participant: current,
      auditBefore: { displayName: current.displayName, availability: current.availability },
      auditAfter: event.before,
      wouldOverwrite,
      ...(wouldOverwrite
        ? { warning: "Later changes touched this participant row. Undoing removes the row and overwrites that newer work." }
        : {})
    };
  }

  if (event.action === "PARTICIPANT_DELETED") {
    if (current) throw new UndoPlanError("A participant with this identity already exists.");
    const before = record(event.before, "before");
    const restored = validateParticipantName(before.displayName);
    const availability = record(before.availability, "availability");
    if (!restored.success || !Object.values(availability).every((value) => value === "yes" || value === "no")) {
      throw new UndoPlanError("The deleted participant snapshot is invalid.");
    }
    return {
      operation: "create",
      participant: {
        id: event.entityId,
        pollId: context.pollId,
        displayName: restored.displayName,
        normalizedName: restored.normalizedName,
        availability: availability as Record<string, "yes" | "no">,
        createdAt: context.occurredAt,
        updatedAt: context.occurredAt
      },
      auditBefore: event.after,
      auditAfter: event.before,
      wouldOverwrite: false
    };
  }

  throw new UndoPlanError("This history entry cannot be undone.");
}
