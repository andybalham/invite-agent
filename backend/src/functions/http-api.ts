import { ApplicationError, type PollService } from "../application/index.js";
import type { DynamoPollRepository } from "../data/index.js";
import { createSharedHttpHandler, type FrameworkResponse } from "../http/index.js";

/** API Gateway HTTP API v2. JWT claims are trusted only from its configured authorizer. */
export interface HttpApiEvent {
  readonly rawPath: string;
  readonly rawQueryString?: string;
  readonly headers?: Readonly<Record<string, string | undefined>>;
  readonly body?: string;
  readonly isBase64Encoded?: boolean;
  readonly requestContext: {
    readonly http: { readonly method: string };
    readonly authorizer?: { readonly jwt?: { readonly claims?: Readonly<Record<string, unknown>> } };
  };
}

type Dependencies = { readonly polls: PollService; readonly repository: DynamoPollRepository };

function response(result: FrameworkResponse) {
  return { statusCode: result.status, headers: { "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store", ...result.headers }, body: JSON.stringify(result.body) };
}

function createHandler(dependencies: Dependencies, scope: "organiser" | "public") {
  return async (event: HttpApiEvent) => {
    if (!event.rawPath.startsWith(`/api/${scope}/`)) {
      return response({ status: 404, body: { error: { code: "NOT_FOUND", message: "Route not found" } } });
    }
    const handler = createSharedHttpHandler({ ...dependencies, authenticate: () => {
      const sub = event.requestContext.authorizer?.jwt?.claims?.sub;
      if (scope !== "organiser" || typeof sub !== "string" || !sub.trim()) {
        throw new ApplicationError("UNAUTHENTICATED", "Verified organiser authentication is required");
      }
      return sub;
    } });
    let body: unknown;
    try {
      body = event.body ? JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body) : undefined;
    } catch {
      return response({ status: 400, body: { error: { code: "VALIDATION_ERROR", message: "Request body must be valid JSON" } } });
    }
    return response(await handler.handle({ method: event.requestContext.http.method, path: event.rawPath,
      rawQuery: event.rawQueryString ?? "", headers: event.headers ?? {}, body }));
  };
}

export const createOrganiserLambdaHandler = (dependencies: Dependencies) => createHandler(dependencies, "organiser");
export const createPublicLambdaHandler = (dependencies: Dependencies) => createHandler(dependencies, "public");
