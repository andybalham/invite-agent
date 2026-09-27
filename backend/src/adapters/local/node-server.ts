import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { FrameworkRequest, FrameworkResponse } from "../../http/index.js";

interface SharedHandler {
  handle(request: FrameworkRequest): Promise<FrameworkResponse>;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: ServerResponse, result: FrameworkResponse): void {
  response.statusCode = result.status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(result.body));
}

export function createLocalNodeServer(handler: SharedHandler): Server {
  return createServer(async (request, response) => {
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
          headers,
          body: await readJson(request)
        })
      );
    } catch {
      send(response, {
        status: 400,
        body: { error: { code: "VALIDATION_ERROR", message: "Request body must be valid JSON" } }
      });
    }
  });
}
