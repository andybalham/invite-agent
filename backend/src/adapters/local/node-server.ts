import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { OWNED_POLL_SHARE_RESPONSE_HEADERS } from "@invite-a-gent/contracts";
import { isOwnedPollShareRequest, type FrameworkRequest, type FrameworkResponse } from "../../http/index.js";

interface SharedHandler {
  handle(request: FrameworkRequest): Promise<FrameworkResponse>;
}

async function readJson(request: IncomingMessage, shareRequest: boolean): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  const body = Buffer.concat(chunks).toString("utf8");
  return shareRequest ? body : JSON.parse(body);
}

function send(response: ServerResponse, result: FrameworkResponse): void {
  response.statusCode = result.status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  for (const [name, value] of Object.entries(result.headers ?? {})) response.setHeader(name, value);
  response.end(JSON.stringify(result.body));
}

export function createLocalNodeServer(handler: SharedHandler): Server {
  return createServer(async (request, response) => {
    const path = (request.url ?? "/").split("?")[0]!;
    const shareRequest = isOwnedPollShareRequest(request.method ?? "GET", path);
    try {
      const headers = Object.fromEntries(
        Object.entries(request.headers).map(([name, value]) => [
          name,
          Array.isArray(value) ? value[0] : value
        ])
      );
      const url = new URL(request.url ?? "/", "http://localhost");
      send(
        response,
        await handler.handle({
          method: request.method ?? "GET",
          path: url.pathname,
          rawQuery: url.search.slice(1),
          headers,
          body: await readJson(request, shareRequest)
        })
      );
    } catch {
      send(response, {
        ...(shareRequest ? { headers: OWNED_POLL_SHARE_RESPONSE_HEADERS } : {}),
        status: shareRequest ? 500 : 400,
        body: { error: shareRequest
          ? { code: "INTERNAL_ERROR", message: "The poll link could not be retrieved" }
          : { code: "VALIDATION_ERROR", message: "Request body must be valid JSON" } }
      });
    }
  });
}
