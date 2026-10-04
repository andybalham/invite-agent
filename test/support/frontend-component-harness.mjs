import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { build } from "vite";
import { createNavigationFixture, navigationOrigin } from "./organiser-navigation-fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Build the actual entry and any future router imports in memory. No HTTP server,
// API, database, production test seam, or generated source file is required.
export async function startComponentBrowser() {
  const output = await build({
    configFile: false, root: path.join(root, "frontend"), logLevel: "silent",
    build: { write: false, minify: false }
  });
  const assets = new Map(output.output.map((asset) => [
    `/${asset.fileName}`, asset.type === "chunk" ? asset.code : asset.source
  ]));
  const html = assets.get("/index.html");
  assert.equal(typeof html, "string", "Vite must build the real application shell");
  const channel = process.env.COMPONENT_BROWSER_CHANNEL ??
    (process.platform === "win32" && !existsSync(chromium.executablePath()) ? "msedge" : undefined);
  const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });

  async function mount(t, options = {}) {
    const fixture = createNavigationFixture(options);
    const context = await browser.newContext();
    t.after(() => context.close());
    const page = await context.newPage();
    page.setDefaultTimeout(1_500);
    page.setDefaultNavigationTimeout(10_000);
    const failures = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      // The existing stylesheet imports a web font; typography is irrelevant to
      // navigation contracts, and component tests must perform no network I/O.
      if (url.origin === "https://fonts.googleapis.com" && request.resourceType() === "stylesheet") {
        await route.fulfill({ body: "", contentType: "text/css" });
        return;
      }
      if (url.origin !== navigationOrigin) {
        failures.push(`Unexpected external request: ${request.url()}`);
        await route.abort();
        return;
      }
      if (url.pathname === "/health" || url.pathname.startsWith("/api/")) {
        try {
          const { status, body } = fixture.respond({
            url: request.url(), method: request.method(),
            identity: request.headers()["x-local-organiser-id"],
            body: request.postData() ? request.postDataJSON() : undefined
          });
          await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
        } catch (error) {
          failures.push(error.message);
          await route.fulfill({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: error.message } } });
        }
        return;
      }
      const asset = assets.get(url.pathname);
      if (asset !== undefined) {
        await route.fulfill({ body: asset, contentType: url.pathname.endsWith(".js")
          ? "text/javascript" : url.pathname.endsWith(".css") ? "text/css" : "text/html" });
      } else if (request.isNavigationRequest()) {
        await route.fulfill({ body: html, contentType: "text/html" });
      } else {
        failures.push(`Unconfigured component asset: ${url.pathname}`);
        await route.abort();
      }
    });
    t.after(() => assert.deepEqual(failures, [], "Component errors must not masquerade as routing failures"));
    return {
      page, fixture,
      goto: (route) => page.goto(new URL(route, navigationOrigin).href, { waitUntil: "domcontentloaded" }),
      listRequests: () => fixture.requests.filter(({ url, method }) =>
        method === "GET" && new URL(url).pathname === "/api/organiser/polls"),
      organiserRequests: () => fixture.requests.filter(({ url }) => new URL(url).pathname.startsWith("/api/organiser/"))
    };
  }

  return { mount, close: () => browser.close() };
}
