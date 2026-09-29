import type {
  Availability,
  CreatePollRequest,
  LifecycleState,
  ProposedDate
} from "@invite-a-gent/contracts";

export interface PollRecord extends CreatePollRequest {
  readonly id: string;
  readonly organiserId: string;
  readonly status: LifecycleState;
  readonly version: number;
  readonly proposedDates: ProposedDate[];
  readonly createdAt: string;
  readonly publicTokenHash?: string;
}

export interface AuditEvent {
  readonly pollId: string;
  readonly id: string;
  readonly action:
    | "POLL_CREATED"
    | "POLL_DETAILS_UPDATED"
    | "POLL_PUBLISHED"
    | "PARTICIPANT_ADDED"
    | "PARTICIPANT_RENAMED"
    | "PARTICIPANT_DELETED"
    | "AVAILABILITY_CHANGED"
    | "UNDO";
  readonly actorId: string;
  readonly actorCategory: "organiser" | "anonymous-link-holder";
  readonly occurredAt: string;
  readonly revision: number;
  readonly entityType: "poll" | "date" | "participant" | "availability";
  readonly entityId: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly undoOfEventId?: string;
  readonly undoOfRevision?: number;
}

export interface ParticipantRecord {
  readonly id: string;
  readonly pollId: string;
  readonly displayName: string;
  readonly normalizedName: string;
  readonly availability: Readonly<Record<string, Availability>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PublicTokenRecord {
  readonly pollId: string;
  readonly state: "active" | "revoked";
}

export interface RepositoryHealth {
  readonly appTable: "reachable";
  readonly auditTable: "reachable";
}
