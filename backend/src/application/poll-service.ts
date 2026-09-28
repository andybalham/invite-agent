import { randomUUID } from "node:crypto";
import type { CreatePollRequest } from "@invite-a-gent/contracts";
import type { DynamoPollRepository, PollRecord } from "../data/index.js";
import {
  renderSafeLocationMarkdown,
  resolveProposedDate,
  validateCreatePollRequest,
  validateDraftPublication
} from "../domain/index.js";
import { ApplicationError } from "./errors.js";

export interface PollResponse {
  readonly id: string;
  readonly title: string;
  readonly status: "draft";
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
    proposedDates: poll.proposedDates,
    ...(poll.description === undefined ? {} : { description: poll.description }),
    ...(poll.instructions === undefined ? {} : { instructions: poll.instructions }),
    ...(poll.location === undefined ? {} : { location: poll.location })
  };
}

function publicResponse(poll: PollRecord): PollResponse {
  const base = {
    id: poll.id,
    title: poll.title,
    status: "draft" as const,
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

export class PollService {
  public constructor(private readonly repository: DynamoPollRepository) {}

  public async create(input: unknown, organiserId: string): Promise<PollResponse> {
    const parsed = validateCreatePollRequest(input);
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
    const parsed = validateCreatePollRequest(input);
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
}
