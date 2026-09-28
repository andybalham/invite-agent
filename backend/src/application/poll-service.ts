import { randomUUID } from "node:crypto";
import type { CreatePollRequest, PublicPollResponse } from "@invite-a-gent/contracts";
import type { DynamoPollRepository, PollRecord } from "../data/index.js";
import {
  renderSafeLocationMarkdown,
  resolveProposedDate,
  validateCreatePollRequest,
  validateDraftPublication
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
      occurredAt: createdAt
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
    const updated: PollRecord = {
      ...existing,
      ...parsed.data,
      proposedDates: resolveChoices(parsed.data),
      version: existing.version + 1
    };
    const occurredAt = new Date().toISOString();
    await this.repository.updatePoll(updated, {
      pollId: id,
      id: randomUUID(),
      action: "POLL_DETAILS_UPDATED",
      actorId: organiserId,
      occurredAt,
      before: pollDetails(existing),
      after: parsed.data
    });
    return publicResponse(updated);
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
        occurredAt
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

  public async getPublic(token: string): Promise<PublicPollResponse> {
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
      participants: [],
      ...(poll.description === undefined ? {} : { description: poll.description }),
      ...(poll.instructions === undefined ? {} : { instructions: poll.instructions }),
      ...(poll.location === undefined
        ? {}
        : { location: poll.location, locationHtml: renderSafeLocationMarkdown(poll.location) })
    };
  }
}
