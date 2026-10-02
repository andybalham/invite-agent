import { randomUUID } from "node:crypto";
import type {
  AuditHistoryEvent,
  AuditHistoryPage,
  Availability,
  ClosePollRequest,
  ClosePollResult,
  CreatePollRequest,
  PublicPollResponse,
  UndoPreview,
  UndoResult
} from "@invite-a-gent/contracts";
import type {
  AuditEvent,
  DynamoPollRepository,
  ParticipantRecord,
  PollRecord
} from "../data/index.js";
import {
  calculateTopFiveRanking,
  planIsolatedUndo,
  renderSafeLocationMarkdown,
  resolveProposedDate,
  validateCreatePollRequest,
  validateDraftPublication,
  validateLocationMarkdown,
  validateParticipantName
} from "../domain/index.js";
import { ApplicationError } from "./errors.js";
import { createPublicToken, hashPublicToken, isPublicToken } from "../security/index.js";

export interface PollResponse {
  readonly id: string;
  readonly title: string;
  readonly status: PollRecord["status"];
  readonly version: number;
  readonly timeZone: string;
  readonly proposedDates: PollRecord["proposedDates"];
  readonly description?: string;
  readonly instructions?: string;
  readonly location?: string;
  readonly locationHtml?: string;
}

function pollDetails(poll: PollRecord): CreatePollRequest {
  return {
    title: poll.title,
    timeZone: poll.timeZone,
    proposedDates: poll.proposedDates.map((choice) =>
      choice.kind === "date"
        ? { kind: "date", localDate: choice.localDate }
        : {
            kind: "date-time",
            localDateTime: choice.localDateTime,
            utcOffset: choice.utcOffset
          }
    ),
    ...(poll.description === undefined ? {} : { description: poll.description }),
    ...(poll.instructions === undefined ? {} : { instructions: poll.instructions }),
    ...(poll.location === undefined ? {} : { location: poll.location })
  };
}

function publicResponse(poll: PollRecord): PollResponse {
  const base = {
    id: poll.id,
    title: poll.title,
    status: poll.status,
    version: poll.version,
    timeZone: poll.timeZone,
    proposedDates: poll.proposedDates
  };
  return {
    ...base,
    ...(poll.description === undefined ? {} : { description: poll.description }),
    ...(poll.instructions === undefined ? {} : { instructions: poll.instructions }),
    ...(poll.location === undefined
      ? {}
      : {
          location: poll.location,
          locationHtml: renderSafeLocationMarkdown(poll.location)
        })
  };
}

function resolveChoices(input: CreatePollRequest): PollRecord["proposedDates"] {
  return input.proposedDates.map((choice) => {
    const result = resolveProposedDate(choice, input.timeZone);
    if (!result.success) {
      throw new ApplicationError("VALIDATION_ERROR", result.issue.message);
    }
    return result.data;
  });
}

function withoutClaimedIdentity(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return input;
  const { organiserId: _organiserId, ownerId: _ownerId, ...pollInput } = input as Record<
    string,
    unknown
  >;
  return pollInput;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function hasExactlyKeys(input: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(input).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function dateIds(poll: PollRecord): string[] {
  return poll.proposedDates.map((_choice, index) => `${poll.id}-date-${index + 1}`);
}

function isTransactionContention(error: unknown): boolean {
  return error instanceof Error && error.name === "TransactionCanceledException";
}

const PUBLIC_MUTATION_ATTEMPTS = 6;

function auditSummary(event: AuditEvent): string {
  const after = event.after as Record<string, unknown> | null;
  const before = event.before as Record<string, unknown> | null;
  switch (event.action) {
    case "POLL_CREATED": return "Created the draft poll";
    case "POLL_DETAILS_UPDATED": return "Updated poll details, dates, or location";
    case "LOCATION_CHANGED": return !after?.location ? "Location cleared" : before?.location ? "Location edited" : "Location set";
    case "POLL_PUBLISHED": return "Published the poll";
    case "POLL_CLOSED": return "Selected the final date and closed the poll";
    case "PARTICIPANT_ADDED": return `Added participant ${String(after?.displayName ?? "")}`.trim();
    case "PARTICIPANT_RENAMED": return `Renamed participant ${String(before?.displayName ?? "")} to ${String(after?.displayName ?? "")}`;
    case "PARTICIPANT_DELETED": return `Deleted participant ${String(before?.displayName ?? "")}`.trim();
    case "AVAILABILITY_CHANGED": return `Changed availability from ${String(before?.value ?? "")} to ${String(after?.value ?? "")}`;
    case "UNDO": return `Undo #${event.undoOfRevision ?? ""}: restored ${event.entityType}`;
  }
}

function historyEvent(event: AuditEvent): AuditHistoryEvent {
  return {
    id: event.id,
    revision: event.revision,
    entity: { type: event.entityType, id: event.entityId },
    action: event.action,
    summary: auditSummary(event),
    before: event.before,
    after: event.after,
    occurredAt: event.occurredAt,
    actor: {
      category: event.actorCategory,
      ...(event.actorCategory === "organiser" ? { subject: event.actorId } : {})
    },
    ...(event.undoOfEventId && event.undoOfRevision
      ? { undoOf: { id: event.undoOfEventId, revision: event.undoOfRevision } }
      : {})
  };
}

export class PollService {
  public constructor(
    private readonly repository: DynamoPollRepository,
    private readonly publicConfig: { readonly baseUrl: string; readonly tokenHashKey: string }
  ) {}

  public async create(input: unknown, organiserId: string): Promise<PollResponse> {
    const parsed = validateCreatePollRequest(withoutClaimedIdentity(input));
    if (!parsed.success) {
      throw new ApplicationError("VALIDATION_ERROR", parsed.issues.join("; "));
    }
    const createdAt = new Date().toISOString();
    const id = randomUUID();
    const poll: PollRecord = {
      ...parsed.data,
      proposedDates: resolveChoices(parsed.data),
      id,
      organiserId,
      status: "draft",
      version: 1,
      createdAt
    };
    await this.repository.createPoll(poll, {
      pollId: id,
      id: randomUUID(),
      action: "POLL_CREATED",
      actorId: organiserId,
      actorCategory: "organiser",
      occurredAt: createdAt,
      revision: poll.version,
      entityType: "poll",
      entityId: id,
      before: null,
      after: pollDetails(poll)
    });
    return publicResponse(poll);
  }

  public async get(id: string, organiserId: string): Promise<PollResponse> {
    const poll = await this.repository.getPoll(id);
    if (!poll) {
      throw new ApplicationError("NOT_FOUND", "Poll not found");
    }
    if (poll.organiserId !== organiserId) {
      throw new ApplicationError("FORBIDDEN", "The organiser does not own this poll");
    }
    return publicResponse(poll);
  }

  public async history(
    id: string,
    organiserId: string,
    pageSize = 25,
    cursor?: string
  ): Promise<AuditHistoryPage> {
    const poll = await this.repository.getPoll(id);
    if (!poll) throw new ApplicationError("NOT_FOUND", "Poll not found");
    if (poll.organiserId !== organiserId) {
      throw new ApplicationError("FORBIDDEN", "The organiser does not own this poll");
    }
    const limit = Number.isSafeInteger(pageSize) ? Math.min(50, Math.max(1, pageSize)) : 25;
    let offset = 0;
    if (cursor) {
      const decoded = Buffer.from(cursor, "base64url").toString("utf8");
      if (!/^\d+$/.test(decoded)) throw new ApplicationError("VALIDATION_ERROR", "Invalid history cursor");
      offset = Number(decoded);
    }
    const events = (await this.repository.listAuditEvents(id)).toReversed();
    if (offset > events.length) throw new ApplicationError("VALIDATION_ERROR", "Invalid history cursor");
    const items = events.slice(offset, offset + limit).map(historyEvent);
    const nextOffset = offset + items.length;
    return {
      items,
      total: events.length,
      ...(nextOffset < events.length
        ? { nextCursor: Buffer.from(String(nextOffset), "utf8").toString("base64url") }
        : {})
    };
  }

  public async previewUndo(
    id: string,
    eventId: string,
    organiserId: string
  ): Promise<UndoPreview> {
    const prepared = await this.prepareUndo(id, eventId, organiserId);
    return {
      eventId: prepared.event.id,
      revision: prepared.event.revision,
      action: prepared.event.action,
      summary: this.undoSummary(prepared.event),
      restoredBefore: prepared.plan.auditBefore,
      restoredAfter: prepared.plan.auditAfter,
      requiresConfirmation: true,
      wouldOverwrite: prepared.plan.wouldOverwrite,
      ...(prepared.plan.warning ? { warning: prepared.plan.warning } : {})
    };
  }

  public async undo(
    id: string,
    eventId: string,
    input: unknown,
    organiserId: string
  ): Promise<UndoResult> {
    if (!isRecord(input) || !hasExactlyKeys(input, ["confirmed"]) || input.confirmed !== true) {
      throw new ApplicationError("VALIDATION_ERROR", "Confirm the undo before applying it.");
    }
    for (let attempt = 0; attempt < PUBLIC_MUTATION_ATTEMPTS; attempt += 1) {
      const prepared = await this.prepareUndo(id, eventId, organiserId);
      const occurredAt = new Date().toISOString();
      const updated = { ...prepared.poll, version: prepared.poll.version + 1 };
      const undoEvent: AuditEvent = {
        pollId: id,
        id: randomUUID(),
        action: "UNDO",
        actorId: organiserId,
        actorCategory: "organiser",
        occurredAt,
        revision: updated.version,
        entityType: prepared.event.entityType,
        entityId: prepared.event.entityId,
        before: prepared.plan.auditBefore,
        after: prepared.plan.auditAfter,
        undoOfEventId: prepared.event.id,
        undoOfRevision: prepared.event.revision
      };
      try {
        await this.repository.applyParticipantUndo(
          updated,
          prepared.current,
          prepared.plan.operation === "delete" ? undefined : prepared.plan.participant,
          undoEvent
        );
        return { poll: await this.publicView(updated), event: historyEvent(undoEvent) };
      } catch (error) {
        if (!isTransactionContention(error)) throw error;
      }
    }
    throw new ApplicationError("CONFLICT", "The poll changed while undo was being applied. Refresh and try again.");
  }

  private async prepareUndo(id: string, eventId: string, organiserId: string) {
    const poll = await this.repository.getPoll(id);
    if (!poll) throw new ApplicationError("NOT_FOUND", "Poll not found");
    if (poll.organiserId !== organiserId) {
      throw new ApplicationError("FORBIDDEN", "The organiser does not own this poll");
    }
    if (poll.status !== "open") {
      throw new ApplicationError("INVALID_LIFECYCLE", "Reopen the poll to undo response changes.");
    }
    const events = await this.repository.listAuditEvents(id);
    const event = events.find(({ id: candidate }) => candidate === eventId);
    if (!event) throw new ApplicationError("NOT_FOUND", "History entry not found");
    if (events.some(({ action, undoOfEventId }) => action === "UNDO" && undoOfEventId === eventId)) {
      throw new ApplicationError("CONFLICT", "This history entry has already been undone.");
    }
    const participants = await this.repository.listParticipants(id);
    const participantId = event.action === "AVAILABILITY_CHANGED"
      ? event.entityId.slice(0, event.entityId.lastIndexOf(":"))
      : event.entityId;
    const current = participants.find(({ id: candidate }) => candidate === participantId);
    try {
      const plan = planIsolatedUndo(event, current, { pollId: id, occurredAt: new Date().toISOString() });
      const restoredDateIds = Object.keys(plan.participant.availability).sort();
      const currentDateIds = dateIds(poll).sort();
      if (restoredDateIds.length !== currentDateIds.length ||
        restoredDateIds.some((dateId, index) => dateId !== currentDateIds[index])) {
        throw new ApplicationError("CONFLICT", "Undo would restore a participant row that no longer matches the poll's dates.");
      }
      if (plan.operation !== "delete" && participants.some(({ id: candidateId, normalizedName }) =>
        candidateId !== plan.participant.id && normalizedName === plan.participant.normalizedName)) {
        throw new ApplicationError("CONFLICT", `Another participant is already named "${plan.participant.displayName}".`);
      }
      return { poll, event, current, plan };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError("CONFLICT", error instanceof Error ? error.message : "This entry cannot be undone.");
    }
  }

  private undoSummary(event: AuditEvent): string {
    const before = event.before as Record<string, unknown> | null;
    const after = event.after as Record<string, unknown> | null;
    switch (event.action) {
      case "PARTICIPANT_ADDED": return `Remove participant ${String(after?.displayName ?? "")}`.trim();
      case "PARTICIPANT_DELETED": return `Restore participant ${String(before?.displayName ?? "")}`.trim();
      case "PARTICIPANT_RENAMED": return `Restore participant name to ${String(before?.displayName ?? "")}`.trim();
      case "AVAILABILITY_CHANGED": return `Restore availability to ${String(before?.value ?? "") === "yes" ? "Yes" : "No"}`;
      default: return "Restore the previous value";
    }
  }

  public async update(id: string, input: unknown, organiserId: string): Promise<PollResponse> {
    const existing = await this.repository.getPoll(id);
    if (!existing) {
      throw new ApplicationError("NOT_FOUND", "Poll not found");
    }
    if (existing.organiserId !== organiserId) {
      throw new ApplicationError("FORBIDDEN", "The organiser does not own this poll");
    }
    const parsed = validateCreatePollRequest(withoutClaimedIdentity(input));
    if (!parsed.success) {
      throw new ApplicationError("VALIDATION_ERROR", parsed.issues.join("; "));
    }
    const proposedDates = resolveChoices(parsed.data);
    if (
      existing.status === "closed" &&
      JSON.stringify(proposedDates) !== JSON.stringify(existing.proposedDates)
    ) {
      throw new ApplicationError(
        "INVALID_LIFECYCLE",
        "Reopen the poll before changing proposed dates."
      );
    }
    const updated: PollRecord = {
      ...existing,
      ...parsed.data,
      proposedDates,
      version: existing.version + 1
    };
    const occurredAt = new Date().toISOString();
    await this.repository.updatePoll(updated, {
      pollId: id,
      id: randomUUID(),
      action: "POLL_DETAILS_UPDATED",
      actorId: organiserId,
      actorCategory: "organiser",
      occurredAt,
      revision: updated.version,
      entityType: "poll",
      entityId: id,
      before: pollDetails(existing),
      after: parsed.data
    });
    return publicResponse(updated);
  }

  public async updateLocation(id: string, input: unknown, organiserId: string): Promise<PollResponse> {
    for (let attempt = 0; attempt < PUBLIC_MUTATION_ATTEMPTS; attempt += 1) {
      const existing = await this.repository.getPoll(id);
      if (!existing) throw new ApplicationError("NOT_FOUND", "Poll not found");
      if (existing.organiserId !== organiserId) {
        throw new ApplicationError("FORBIDDEN", "The organiser does not own this poll");
      }
      if (!isRecord(input) || !hasExactlyKeys(input, ["location"]) || typeof input.location !== "string") {
        throw new ApplicationError("VALIDATION_ERROR", "Enter location details as plain text or safe Markdown.");
      }
      const issue = validateLocationMarkdown(input.location);
      if (issue) throw new ApplicationError("VALIDATION_ERROR", issue.message);
      const updated = { ...existing, location: input.location, version: existing.version + 1 };
      try {
        await this.repository.updateLocation(updated, {
          pollId: id, id: randomUUID(), action: "LOCATION_CHANGED", actorId: organiserId,
          actorCategory: "organiser", occurredAt: new Date().toISOString(), revision: updated.version,
          entityType: "poll", entityId: id,
          before: { location: existing.location ?? "" }, after: { location: input.location }
        });
        return publicResponse(updated);
      } catch (error) {
        if (!isTransactionContention(error)) throw error;
      }
    }
    throw new ApplicationError("CONFLICT", "The poll changed while saving location. Refresh and try again.");
  }

  public async assertPublicationReady(
    id: string,
    organiserId: string
  ): Promise<{ readonly ready: true }> {
    const poll = await this.repository.getPoll(id);
    if (!poll) throw new ApplicationError("NOT_FOUND", "Poll not found");
    if (poll.organiserId !== organiserId) {
      throw new ApplicationError("FORBIDDEN", "The organiser does not own this poll");
    }
    const readiness = validateDraftPublication(pollDetails(poll));
    if (!readiness.success) {
      throw new ApplicationError(
        "VALIDATION_ERROR",
        readiness.issues.map(({ message }) => message).join("; ")
      );
    }
    return { ready: true };
  }

  public async publish(
    id: string,
    organiserId: string
  ): Promise<{ readonly poll: PollResponse; readonly publicUrl: string }> {
    const existing = await this.repository.getPoll(id);
    if (!existing) throw new ApplicationError("NOT_FOUND", "Poll not found");
    if (existing.organiserId !== organiserId) {
      throw new ApplicationError("FORBIDDEN", "The organiser does not own this poll");
    }
    if (existing.status !== "draft") {
      throw new ApplicationError("INVALID_LIFECYCLE", "Only a draft poll can be published");
    }
    const readiness = validateDraftPublication(pollDetails(existing));
    if (!readiness.success) {
      throw new ApplicationError(
        "VALIDATION_ERROR",
        readiness.issues.map(({ message }) => message).join("; ")
      );
    }
    const token = createPublicToken();
    const occurredAt = new Date().toISOString();
    const published: PollRecord = {
      ...existing,
      status: "open",
      version: existing.version + 1,
      publicTokenHash: hashPublicToken(token, this.publicConfig.tokenHashKey)
    };
    try {
      await this.repository.publishPoll(published, {
        pollId: id,
        id: randomUUID(),
        action: "POLL_PUBLISHED",
        actorId: organiserId,
        actorCategory: "organiser",
        occurredAt,
        revision: published.version,
        entityType: "poll",
        entityId: id,
        before: { status: existing.status },
        after: { status: published.status }
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TransactionCanceledException") {
        throw new ApplicationError(
          "CONFLICT",
          "The poll changed while it was being published; refresh and try again"
        );
      }
      throw error;
    }
    return {
      poll: publicResponse(published),
      publicUrl: `${this.publicConfig.baseUrl.replace(/\/$/, "")}/p/${token}`
    };
  }

  public async close(id: string, input: unknown, organiserId: string): Promise<ClosePollResult> {
    const existing = await this.repository.getPoll(id);
    if (!existing) throw new ApplicationError("NOT_FOUND", "Poll not found");
    if (existing.organiserId !== organiserId) {
      throw new ApplicationError("FORBIDDEN", "The organiser does not own this poll");
    }
    if (!isRecord(input) || !hasExactlyKeys(input, ["selectedDateId", "confirmed"]) ||
      typeof input.selectedDateId !== "string" || input.selectedDateId.length === 0 ||
      input.confirmed !== true) {
      throw new ApplicationError("VALIDATION_ERROR", "Choose a proposed date and confirm closure.");
    }
    if (existing.status !== "open") {
      throw new ApplicationError("CONFLICT", "The poll is no longer open. Refresh and try again.");
    }
    const request = input as unknown as ClosePollRequest;
    if (!dateIds(existing).includes(request.selectedDateId)) {
      throw new ApplicationError("VALIDATION_ERROR", "Choose a date proposed for this poll.");
    }
    const participants = await this.repository.listParticipants(id);
    const frozenRanking = calculateTopFiveRanking(dateIds(existing), participants);
    const closed: PollRecord = {
      ...existing,
      status: "closed",
      selectedDateId: request.selectedDateId,
      frozenRanking,
      version: existing.version + 1
    };
    const occurredAt = new Date().toISOString();
    try {
      await this.repository.closePoll(closed, {
        pollId: id,
        id: randomUUID(),
        action: "POLL_CLOSED",
        actorId: organiserId,
        actorCategory: "organiser",
        occurredAt,
        revision: closed.version,
        entityType: "poll",
        entityId: id,
        before: { status: existing.status },
        after: { status: closed.status, selectedDateId: closed.selectedDateId, ranking: frozenRanking }
      });
    } catch (error) {
      if (isTransactionContention(error)) {
        throw new ApplicationError("CONFLICT", "The poll changed while it was being closed. Refresh and try again.");
      }
      throw error;
    }
    return { poll: await this.publicView(closed) as ClosePollResult["poll"] };
  }

  public async getPublic(token: string): Promise<PublicPollResponse> {
    const poll = await this.resolvePublicPoll(token);
    return this.publicView(poll);
  }

  public async addParticipant(token: string, input: unknown): Promise<PublicPollResponse> {
    if (!isRecord(input) || !hasExactlyKeys(input, ["displayName"])) {
      throw new ApplicationError("VALIDATION_ERROR", "Provide only a display name.");
    }
    const name = validateParticipantName(input.displayName);
    if (!name.success) throw new ApplicationError("VALIDATION_ERROR", name.message);

    for (let attempt = 0; attempt < PUBLIC_MUTATION_ATTEMPTS; attempt += 1) {
      const poll = await this.resolvePublicPoll(token);
      this.assertOpen(poll);
      const now = new Date().toISOString();
      const participant: ParticipantRecord = {
        id: randomUUID(),
        pollId: poll.id,
        displayName: name.displayName,
        normalizedName: name.normalizedName,
        availability: Object.fromEntries(dateIds(poll).map((dateId) => [dateId, "no" as const])),
        createdAt: now,
        updatedAt: now
      };
      const updated = { ...poll, version: poll.version + 1 };
      try {
        await this.repository.createParticipant(updated, participant, {
          pollId: poll.id,
          id: randomUUID(),
          action: "PARTICIPANT_ADDED",
          actorId: "anonymous",
          actorCategory: "anonymous-link-holder",
          occurredAt: now,
          revision: updated.version,
          entityType: "participant",
          entityId: participant.id,
          before: null,
          after: { displayName: participant.displayName, availability: participant.availability }
        });
        return this.getPublic(token);
      } catch (error) {
        if (!isTransactionContention(error)) throw error;
      }
    }
    throw new ApplicationError(
      "CONFLICT",
      `"${name.displayName}" is already in this poll. Names must be unique (capitals don't count).`
    );
  }

  public async updateParticipant(
    token: string,
    participantId: string,
    input: unknown
  ): Promise<PublicPollResponse> {
    if (!isRecord(input)) {
      throw new ApplicationError("VALIDATION_ERROR", "Invalid participant update.");
    }
    if (hasExactlyKeys(input, ["displayName"])) {
      return this.renameParticipant(token, participantId, input.displayName);
    }
    if (hasExactlyKeys(input, ["availability", "dateId"])) {
      return this.setAvailability(token, participantId, input.dateId, input.availability);
    }
    throw new ApplicationError("VALIDATION_ERROR", "Invalid participant update.");
  }

  public async removeParticipant(
    token: string,
    participantId: string,
    input: unknown
  ): Promise<PublicPollResponse> {
    if (!isRecord(input) || !hasExactlyKeys(input, ["confirmation"]) || typeof input.confirmation !== "string") {
      throw new ApplicationError("VALIDATION_ERROR", "Type the current display name to confirm deletion.");
    }
    for (let attempt = 0; attempt < PUBLIC_MUTATION_ATTEMPTS; attempt += 1) {
      const poll = await this.resolvePublicPoll(token);
      this.assertOpen(poll);
      const participant = await this.findParticipant(poll.id, participantId);
      if (input.confirmation !== participant.displayName) {
        throw new ApplicationError(
          "VALIDATION_ERROR",
          `That doesn't match "${participant.displayName}". The row was not deleted.`
        );
      }
      const now = new Date().toISOString();
      const updated = { ...poll, version: poll.version + 1 };
      try {
        await this.repository.deleteParticipant(updated, participant, {
          pollId: poll.id,
          id: randomUUID(),
          action: "PARTICIPANT_DELETED",
          actorId: "anonymous",
          actorCategory: "anonymous-link-holder",
          occurredAt: now,
          revision: updated.version,
          entityType: "participant",
          entityId: participant.id,
          before: { displayName: participant.displayName, availability: participant.availability },
          after: null
        });
        return this.getPublic(token);
      } catch (error) {
        if (!isTransactionContention(error)) throw error;
      }
    }
    throw new ApplicationError("RATE_LIMITED", "The table is busy. Try again.");
  }

  private async renameParticipant(
    token: string,
    participantId: string,
    displayName: unknown
  ): Promise<PublicPollResponse> {
    const name = validateParticipantName(displayName);
    if (!name.success) throw new ApplicationError("VALIDATION_ERROR", name.message);
    for (let attempt = 0; attempt < PUBLIC_MUTATION_ATTEMPTS; attempt += 1) {
      const poll = await this.resolvePublicPoll(token);
      this.assertOpen(poll);
      const participant = await this.findParticipant(poll.id, participantId);
      const now = new Date().toISOString();
      const replacement: ParticipantRecord = {
        ...participant,
        displayName: name.displayName,
        normalizedName: name.normalizedName,
        updatedAt: now
      };
      const updated = { ...poll, version: poll.version + 1 };
      try {
        await this.repository.replaceParticipant(updated, participant, replacement, {
          pollId: poll.id,
          id: randomUUID(),
          action: "PARTICIPANT_RENAMED",
          actorId: "anonymous",
          actorCategory: "anonymous-link-holder",
          occurredAt: now,
          revision: updated.version,
          entityType: "participant",
          entityId: participant.id,
          before: { displayName: participant.displayName },
          after: { displayName: replacement.displayName }
        });
        return this.getPublic(token);
      } catch (error) {
        if (!isTransactionContention(error)) throw error;
      }
    }
    throw new ApplicationError(
      "CONFLICT",
      `"${name.displayName}" is already in this poll. Names must be unique (capitals don't count).`
    );
  }

  private async setAvailability(
    token: string,
    participantId: string,
    dateId: unknown,
    availability: unknown
  ): Promise<PublicPollResponse> {
    if (typeof dateId !== "string" || (availability !== "yes" && availability !== "no")) {
      throw new ApplicationError("VALIDATION_ERROR", "Availability must be Yes or No for a current date.");
    }
    for (let attempt = 0; attempt < PUBLIC_MUTATION_ATTEMPTS; attempt += 1) {
      const poll = await this.resolvePublicPoll(token);
      this.assertOpen(poll);
      if (!dateIds(poll).includes(dateId)) {
        throw new ApplicationError("VALIDATION_ERROR", "Availability must be Yes or No for a current date.");
      }
      const participant = await this.findParticipant(poll.id, participantId);
      const before = participant.availability[dateId];
      if (before === undefined) {
        throw new ApplicationError("VALIDATION_ERROR", "Availability must be Yes or No for a current date.");
      }
      const now = new Date().toISOString();
      const replacement: ParticipantRecord = {
        ...participant,
        availability: { ...participant.availability, [dateId]: availability as Availability },
        updatedAt: now
      };
      const updated = { ...poll, version: poll.version + 1 };
      try {
        await this.repository.replaceParticipant(updated, participant, replacement, {
          pollId: poll.id,
          id: randomUUID(),
          action: "AVAILABILITY_CHANGED",
          actorId: "anonymous",
          actorCategory: "anonymous-link-holder",
          occurredAt: now,
          revision: updated.version,
          entityType: "availability",
          entityId: `${participant.id}:${dateId}`,
          before: { value: before },
          after: { value: availability }
        });
        return this.getPublic(token);
      } catch (error) {
        if (!isTransactionContention(error)) throw error;
      }
    }
    throw new ApplicationError("RATE_LIMITED", "The table is busy. Try again.");
  }

  private async resolvePublicPoll(token: string): Promise<PollRecord> {
    if (!isPublicToken(token)) throw new ApplicationError("NOT_FOUND", "Poll link not found");
    const capability = await this.repository.getPublicToken(
      hashPublicToken(token, this.publicConfig.tokenHashKey)
    );
    if (!capability) throw new ApplicationError("NOT_FOUND", "Poll link not found");
    if (capability.state === "revoked") {
      throw new ApplicationError("LINK_REVOKED", "This poll link is no longer valid");
    }
    const poll = await this.repository.getPoll(capability.pollId);
    if (!poll || poll.status === "draft") {
      throw new ApplicationError("NOT_FOUND", "Poll link not found");
    }
    return poll;
  }

  private assertOpen(poll: PollRecord): void {
    if (poll.status !== "open") {
      throw new ApplicationError("INVALID_LIFECYCLE", "This poll is closed. Responses are read-only.");
    }
  }

  private async findParticipant(pollId: string, participantId: string): Promise<ParticipantRecord> {
    const participant = (await this.repository.listParticipants(pollId)).find(
      ({ id }) => id === participantId
    );
    if (!participant) throw new ApplicationError("NOT_FOUND", "Participant not found");
    return participant;
  }

  private async publicView(poll: PollRecord): Promise<PublicPollResponse> {
    const participants = await this.repository.listParticipants(poll.id);
    const proposedDateIds = dateIds(poll);
    return {
      id: poll.id,
      title: poll.title,
      status: poll.status,
      version: poll.version,
      timeZone: poll.timeZone,
      proposedDates: poll.proposedDates.map((choice, index) => ({
        id: `${poll.id}-date-${index + 1}`,
        ...(choice.kind === "date"
          ? { kind: "date" as const, localDate: choice.localDate }
          : {
              kind: "date-time" as const,
              localDateTime: choice.localDateTime,
              utcOffset: choice.utcOffset
            })
      })),
      participants: participants.map(({ id, displayName, availability }) => ({
        id,
        displayName,
        availability: { ...availability }
      })),
      ranking: poll.status === "closed" && poll.frozenRanking
        ? poll.frozenRanking.map((entry) => ({ ...entry }))
        : calculateTopFiveRanking(proposedDateIds, participants),
      ...(poll.selectedDateId === undefined ? {} : { selectedDateId: poll.selectedDateId }),
      ...(poll.description === undefined ? {} : { description: poll.description }),
      ...(poll.instructions === undefined ? {} : { instructions: poll.instructions }),
      ...(poll.location === undefined
        ? {}
        : { location: poll.location, locationHtml: renderSafeLocationMarkdown(poll.location) })
    };
  }
}
