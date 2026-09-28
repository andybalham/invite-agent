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
