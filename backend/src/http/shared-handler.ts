import { ApplicationError, type PollService } from "../application/index.js";
import type { DynamoPollRepository } from "../data/index.js";

export interface FrameworkRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body?: unknown;
}

export interface FrameworkResponse {
  readonly status: number;
  readonly body: unknown;
}

export type Authenticate = (headers: FrameworkRequest["headers"]) => string;

function errorResponse(error: unknown): FrameworkResponse {
  if (error instanceof ApplicationError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message } }
    };
  }
  return {
    status: 500,
    body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } }
  };
}

export function createSharedHttpHandler(dependencies: {
  readonly authenticate: Authenticate;
  readonly polls: PollService;
  readonly repository: DynamoPollRepository;
}): { handle(request: FrameworkRequest): Promise<FrameworkResponse> } {
  return {
    async handle(request) {
      try {
        if (request.method === "GET" && request.path === "/health") {
          await dependencies.repository.health();
          return { status: 200, body: { status: "ok" } };
        }
        if (request.method === "POST" && request.path === "/api/organiser/polls") {
          const organiserId = dependencies.authenticate(request.headers);
          return { status: 201, body: await dependencies.polls.create(request.body, organiserId) };
        }
        const readinessMatch = /^\/api\/organiser\/polls\/([^/]+)\/publication-readiness$/.exec(
          request.path
        );
        if (request.method === "POST" && readinessMatch?.[1]) {
          const organiserId = dependencies.authenticate(request.headers);
          return {
            status: 200,
            body: await dependencies.polls.assertPublicationReady(
              readinessMatch[1],
              organiserId
            )
          };
        }
        const publishMatch = /^\/api\/organiser\/polls\/([^/]+)\/publish$/.exec(request.path);
        if (request.method === "POST" && publishMatch?.[1]) {
          const organiserId = dependencies.authenticate(request.headers);
          return {
            status: 200,
            body: await dependencies.polls.publish(publishMatch[1], organiserId)
          };
        }
        const closeMatch = /^\/api\/organiser\/polls\/([^/]+)\/close$/.exec(request.path);
        if (request.method === "POST" && closeMatch?.[1]) {
          const organiserId = dependencies.authenticate(request.headers);
          return { status: 200, body: await dependencies.polls.close(closeMatch[1], request.body, organiserId) };
        }
        const publicMatch = /^\/api\/public\/polls\/([^/]+)$/.exec(request.path);
        if (request.method === "GET" && publicMatch?.[1]) {
          return { status: 200, body: await dependencies.polls.getPublic(publicMatch[1]) };
        }
        const publicParticipantsMatch = /^\/api\/public\/polls\/([^/]+)\/participants$/.exec(
          request.path
        );
        if (request.method === "POST" && publicParticipantsMatch?.[1]) {
          return {
            status: 201,
            body: await dependencies.polls.addParticipant(
              publicParticipantsMatch[1],
              request.body
            )
          };
        }
        const publicParticipantMatch =
          /^\/api\/public\/polls\/([^/]+)\/participants\/([^/]+)$/.exec(request.path);
        if (request.method === "PUT" && publicParticipantMatch?.[1] && publicParticipantMatch[2]) {
          return {
            status: 200,
            body: await dependencies.polls.updateParticipant(
              publicParticipantMatch[1],
              publicParticipantMatch[2],
              request.body
            )
          };
        }
        if (
          request.method === "DELETE" &&
          publicParticipantMatch?.[1] &&
          publicParticipantMatch[2]
        ) {
          return {
            status: 200,
            body: await dependencies.polls.removeParticipant(
              publicParticipantMatch[1],
              publicParticipantMatch[2],
              request.body
            )
          };
        }
        const historyMatch = /^\/api\/organiser\/polls\/([^/]+)\/history$/.exec(request.path);
        if (request.method === "GET" && historyMatch?.[1]) {
          const organiserId = dependencies.authenticate(request.headers);
          const requestedSize = Number(request.headers["x-audit-page-size"] ?? "25");
          return {
            status: 200,
            body: await dependencies.polls.history(
              historyMatch[1],
              organiserId,
              requestedSize,
              request.headers["x-audit-cursor"]
            )
          };
        }
        const undoPreviewMatch = /^\/api\/organiser\/polls\/([^/]+)\/history\/([^/]+)\/undo-preview$/.exec(request.path);
        if (request.method === "POST" && undoPreviewMatch?.[1] && undoPreviewMatch[2]) {
          const organiserId = dependencies.authenticate(request.headers);
          return {
            status: 200,
            body: await dependencies.polls.previewUndo(
              undoPreviewMatch[1],
              undoPreviewMatch[2],
              organiserId
            )
          };
        }
        const undoMatch = /^\/api\/organiser\/polls\/([^/]+)\/history\/([^/]+)\/undo$/.exec(request.path);
        if (request.method === "POST" && undoMatch?.[1] && undoMatch[2]) {
          const organiserId = dependencies.authenticate(request.headers);
          return {
            status: 200,
            body: await dependencies.polls.undo(
              undoMatch[1],
              undoMatch[2],
              request.body,
              organiserId
            )
          };
        }
        const match = /^\/api\/organiser\/polls\/([^/]+)$/.exec(request.path);
        if (request.method === "GET" && match?.[1]) {
          const organiserId = dependencies.authenticate(request.headers);
          return { status: 200, body: await dependencies.polls.get(match[1], organiserId) };
        }
        if (request.method === "PUT" && match?.[1]) {
          const organiserId = dependencies.authenticate(request.headers);
          return {
            status: 200,
            body: await dependencies.polls.update(match[1], request.body, organiserId)
          };
        }
        throw new ApplicationError("NOT_FOUND", "Route not found");
      } catch (error) {
        return errorResponse(error);
      }
    }
  };
}
