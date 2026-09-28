import type { CreatePollRequest, LifecycleState, ProposedDate } from "@invite-a-gent/contracts";

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
  readonly action: "POLL_CREATED" | "POLL_DETAILS_UPDATED" | "POLL_PUBLISHED";
  readonly actorId: string;
  readonly occurredAt: string;
  readonly before?: CreatePollRequest;
  readonly after?: CreatePollRequest;
}

export interface PublicTokenRecord {
  readonly pollId: string;
  readonly state: "active" | "revoked";
}

export interface RepositoryHealth {
  readonly appTable: "reachable";
  readonly auditTable: "reachable";
}
