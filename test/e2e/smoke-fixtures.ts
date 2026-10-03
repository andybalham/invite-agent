import type { APIRequestContext, Browser, BrowserContext, Page, TestInfo } from "@playwright/test";
import type { AuditHistoryEvent, AuditHistoryPage, PublicPollResponse } from "@invite-a-gent/contracts";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test as existingTest } from "./fixtures";

export function redact(text: string): string {
  return text
    .replace(/(\/(?:api\/public\/polls|p)\/)[A-Za-z0-9_-]{32}/g, "$1[REDACTED]")
    .replace(/local-organiser-[a-z0-9-]+/g, "[ORGANISER]");
}

type Snapshot = { owner: unknown; history: AuditHistoryEvent[]; public?: PublicPollResponse };

export class SmokeHarness {
  pollId = "";
  publicUrl = "";
  checkpoint = "bootstrap";
  browserRole = "owner";
  lastAction = "initializing";
  completed: string[] = [];
  apiLog: string[] = [];
  readonly headers: Record<string, string>;
  private contexts: { role: string; context: BrowserContext; page: Page }[] = [];
  private pendingLogs: Promise<void>[] = [];
  private lastSnapshot: Snapshot | undefined;

  constructor(
    readonly runId: string,
    readonly api: APIRequestContext,
    readonly browser: Browser,
    readonly owner: Page,
    readonly baseURL: string,
    readonly info: TestInfo
  ) {
    this.headers = { "x-local-organiser-id": `local-organiser-${runId}` };
    this.observe(owner, "owner");
  }

  get management(): string { return `/api/organiser/polls/${this.pollId}`; }
  get publicPath(): string { return `/api/public/polls/${new URL(this.publicUrl).pathname.split("/").at(-1)}`; }
  get ownerUrl(): string { return `${this.publicUrl}?organiser=1&testRunId=${this.runId}`; }
  get historyUrl(): string { return `/?pollId=${this.pollId}&testRunId=${this.runId}&view=history`; }

  async recordCreatedPoll(pollId: string): Promise<void> {
    this.pollId = pollId;
    if (process.env.SMOKE_RUN_MANIFEST_PATH) {
      const { recordPoll } = await import(pathToFileURL(path.resolve("scripts/smoke-run-resources.mjs")).href);
      await recordPoll(process.env.SMOKE_RUN_MANIFEST_PATH, pollId);
    }
  }

  private observe(page: Page, role: string): void {
    page.on("response", (response) => {
      if (!/^\/(api|health)(\/|$)/.test(new URL(response.url()).pathname)) return;
      this.pendingLogs.push((async () => {
        const body = await response.json().catch(() => ({}));
        this.apiLog.push(redact(`${role} ${response.request().method()} ${new URL(response.url()).pathname} ${response.status()} ${body.error?.code ?? ""}`));
      })());
    });
    page.on("requestfailed", (request) => {
      this.apiLog.push(redact(`${role} FAILED ${request.method()} ${new URL(request.url()).pathname} ${request.failure()?.errorText ?? ""}`));
    });
  }

  async publicPage(role: string): Promise<Page> {
    const context = await this.browser.newContext({
      baseURL: this.baseURL,
      recordVideo: { dir: this.info.outputPath(`${role}-video`) }
    });
    context.setDefaultTimeout(15_000);
    context.setDefaultNavigationTimeout(15_000);
    // The Playwright runner starts/retains tracing for all browser.newContext() calls.
    const page = await context.newPage();
    this.contexts.push({ role, context, page });
    this.observe(page, role);
    await page.goto(this.publicUrl);
    return page;
  }

  async call(method: string, url: string, options: { headers?: Record<string, string>; data?: unknown } = {}) {
    const response = await this.api.fetch(url, { method, ...options }).catch((error: unknown) => {
      this.apiLog.push(redact(`api-probe FAILED ${method} ${url} ${String(error)}`));
      throw error;
    });
    const body = await response.json();
    this.apiLog.push(redact(`api-probe ${method} ${url} ${response.status()} ${body.error?.code ?? ""}`));
    return { response, body };
  }

  async history(): Promise<AuditHistoryEvent[]> {
    const items: AuditHistoryEvent[] = [];
    let cursor: string | undefined;
    do {
      const { response, body } = await this.call("GET", `${this.management}/history`, {
        headers: { ...this.headers, ...(cursor ? { "x-audit-cursor": cursor } : {}) }
      });
      expect(response.status()).toBe(200);
      const page = body as AuditHistoryPage;
      items.push(...page.items);
      cursor = page.nextCursor;
      if (!cursor) expect(items).toHaveLength(page.total);
    } while (cursor);
    expect(items.map(({ revision }) => revision)).toEqual(items.map(({ revision }) => revision).sort((a, b) => b - a));
    expect(new Set(items.map(({ id }) => id)).size).toBe(items.length);
    return items;
  }

  async publicPoll(): Promise<PublicPollResponse> {
    const { response, body } = await this.call("GET", this.publicPath);
    expect(response.status()).toBe(200);
    const text = JSON.stringify(body);
    for (const field of ["organiserId", "publicTokenHash", "audit", "actorId"]) expect(text).not.toContain(field);
    expect(text).not.toContain(new URL(this.publicUrl).pathname.split("/").at(-1)!);
    return body;
  }

  async snapshot(includePublic = Boolean(this.publicUrl)): Promise<Snapshot> {
    const { response, body: owner } = await this.call("GET", this.management, { headers: this.headers });
    expect(response.status()).toBe(200);
    const snapshot = { owner, history: await this.history(), ...(includePublic ? { public: await this.publicPoll() } : {}) };
    this.lastSnapshot = snapshot;
    return snapshot;
  }

  async unchanged(action: () => Promise<unknown>, includePublic = Boolean(this.publicUrl)): Promise<void> {
    const before = await this.snapshot(includePublic);
    await action();
    expect(await this.snapshot(includePublic)).toEqual(before);
  }

  async rejected(method: string, url: string, status: number, code: string, options: { headers?: Record<string, string>; data?: unknown } = {}): Promise<void> {
    this.browserRole = "api-probe";
    this.lastAction = `rejected ${method} ${redact(url)}`;
    const { response, body } = await this.call(method, url, options);
    expect(response.status()).toBe(status);
    expect(body.error.code).toBe(code);
    expect(Object.keys(body)).toEqual(["error"]);
    for (const privateValue of [this.pollId, "Alice", this.headers["x-local-organiser-id"]]) expect(JSON.stringify(body)).not.toContain(privateValue);
  }

  async accepted(
    page: Page, role: string, label: string, actions: string[], action: () => Promise<unknown>,
    entity?: { type: string; id?: string }
  ): Promise<AuditHistoryEvent> {
    this.browserRole = role;
    this.lastAction = label;
    const before = this.pollId ? await this.history() : [];
    const started = Date.now();
    const writes: { status: number; path: string }[] = [];
    const listener = (response: import("@playwright/test").Response) => {
      if (/^\/api\//.test(new URL(response.url()).pathname) && ["POST", "PUT", "DELETE"].includes(response.request().method()) && response.ok() && !/undo-preview|publication-readiness/.test(response.url())) {
        writes.push({ status: response.status(), path: new URL(response.url()).pathname });
      }
    };
    page.on("response", listener);
    try {
      await action();
      await expect.poll(async () => (await this.history()).length).toBe(before.length + actions.length);
    } finally { page.off("response", listener); }
    const after = await this.history();
    const added = after.slice(0, actions.length).toReversed();
    expect(added.map(({ action: name }) => name)).toEqual(actions);
    expect(writes).toHaveLength(actions.length);
    expect(after.slice(actions.length)).toEqual(before);
    for (const event of added) {
      expect(event.revision).toBe((before[0]?.revision ?? 0) + added.indexOf(event) + 1);
      expect(Date.parse(event.occurredAt)).toBeGreaterThanOrEqual(started);
      expect(Date.parse(event.occurredAt)).toBeLessThanOrEqual(Date.now());
      expect(event).toHaveProperty("before");
      expect(event).toHaveProperty("after");
      // Publishing saves the current draft even when no field has changed.
      if (event.action !== "POLL_DETAILS_UPDATED") expect(event.before).not.toEqual(event.after);
      expect(event.entity.id).toBeTruthy();
      expect(event.actor.category).toBe(role === "owner" ? "organiser" : "anonymous-link-holder");
      if (role === "owner") expect(event.actor.subject).toBe(this.headers["x-local-organiser-id"]);
      else expect(event.actor).not.toHaveProperty("subject");
      if (entity) expect(event.entity).toMatchObject(entity);
      if (this.publicUrl) expect(JSON.stringify(event)).not.toContain(new URL(this.publicUrl).pathname.split("/").at(-1)!);
    }
    await this.snapshot();
    return added.at(-1)!;
  }

  async step(name: string, action: () => Promise<void>): Promise<void> {
    this.checkpoint = name;
    await existingTest.step(name, action);
    this.completed.push(name);
  }

  // Test-only setup: no route, no table initialization or deletion, and only this attempt's capability.
  async revokeOwnCapability(): Promise<void> {
    const state = JSON.parse(await readFile(path.resolve(".devstack/processes.json"), "utf8"));
    expect(new URL(this.baseURL).port).toBe(String(state.ports.web));
    const endpoint = process.env.DYNAMODB_ENDPOINT ?? `http://127.0.0.1:${state.ports.dynamodb}`;
    const parsed = new URL(endpoint);
    expect(["127.0.0.1", "localhost"]).toContain(parsed.hostname);
    expect(parsed.port).toBe(String(state.ports.dynamodb));
    const moduleUrl = pathToFileURL(path.resolve("backend/dist/adapters/local/composition.js")).href;
    const { createLocalComposition } = await import(moduleUrl);
    const { hashPublicToken } = await import(pathToFileURL(path.resolve("backend/dist/security/public-token.js")).href);
    const hashKey = process.env.PUBLIC_TOKEN_HASH_KEY ?? "local-development-token-hash-key";
    const app = await createLocalComposition({
      appEnv: "test", authMode: "local", awsRegion: process.env.AWS_REGION ?? "eu-west-2",
      dynamodbEndpoint: endpoint,
      appTableName: process.env.APP_TABLE_NAME ?? "invite-agent-local-app",
      auditTableName: process.env.AUDIT_TABLE_NAME ?? "invite-agent-local-audit",
      publicBaseUrl: this.baseURL, publicTokenHashKey: hashKey
    });
    try {
      const poll = await app.repository.getPoll(this.pollId);
      expect(poll?.id).toBe(this.pollId);
      expect(poll?.organiserId).toBe(this.headers["x-local-organiser-id"]);
      const hash = hashPublicToken(new URL(this.publicUrl).pathname.split("/").at(-1), hashKey);
      expect(poll?.publicTokenHash === hash, "Revocation hook must match running API table/hash configuration").toBe(true);
      expect(await app.repository.getPublicToken(hash)).toEqual({ pollId: this.pollId, state: "active" });
      await app.repository.revokePublicToken(hash);
      expect(await app.repository.getPublicToken(hash)).toEqual({ pollId: this.pollId, state: "revoked" });
    } finally { await app.dispose(); }
  }

  async finish(): Promise<void> {
    const failed = this.info.status !== this.info.expectedStatus;
    const sanitize = (text: string): string => {
      const token = this.publicUrl ? new URL(this.publicUrl).pathname.split("/").at(-1)! : "";
      return redact(token ? text.replaceAll(token, "[REDACTED]") : text);
    };
    const safeAttach = async (name: string, body: string | Buffer, contentType: string) => {
      await this.info.attach(name, { body, contentType }).catch(() => {});
    };
    if (failed) {
      for (const { role, page } of [{ role: "owner", page: this.owner }, ...this.contexts]) {
        if (!page.isClosed()) await page.screenshot({ fullPage: true }).then((body) => safeAttach(`${role}.png`, body, "image/png")).catch(() => {});
      }
      for (const name of ["api.out.log", "api.error.log", "vite.out.log", "vite.error.log"]) {
        const contents = await readFile(path.resolve(".devstack/service-logs", name), "utf8").catch(() => `[log unavailable: ${name}]`);
        await safeAttach(`service-${name}`, sanitize(contents), "text/plain");
      }
    }
    for (const { role, context, page } of this.contexts) {
      const video = page.video();
      await context.close().catch(() => {});
      if (video) {
        if (failed) await video.path().then((file) => this.info.attach(`${role}-video`, { path: file, contentType: "video/webm" })).catch(() => {});
        else await video.delete().catch(() => {});
      }
    }
    await Promise.allSettled(this.pendingLogs);
    if (failed) await safeAttach("smoke-api.log", sanitize(`${this.apiLog.join("\n")}\n`), "text/plain");
    const summary = sanitize(JSON.stringify({
      runId: this.runId, pollId: this.pollId || null, checkpoint: this.checkpoint,
      manifestPath: process.env.SMOKE_RUN_MANIFEST_PATH ?? null,
      browserRole: this.browserRole, lastAction: this.lastAction, completed: this.completed,
      result: this.info.status, errors: this.info.errors.map(({ message }) => message),
      lastAuthoritativeSnapshot: failed ? this.lastSnapshot : undefined,
      limitations: [
        "SM-11 checks revocation via a test-only repository hook; organiser regeneration has no supported route/UI.",
        "History availability Before/After cells show Changed values; exact values are asserted in the action summary and owner API.",
        process.env.SMOKE_RUN_MANIFEST_PATH ? "Wrapper deletes owned tables after collecting diagnostics." : "Direct invocation retains its poll in the running stack."
      ]
    }, null, 2));
    // Keep an inspectable file on successful runs as well as an HTML attachment.
    const summaryPath = this.info.outputPath("smoke-summary.json");
    await writeFile(summaryPath, `${summary}\n`, "utf8")
      .then(() => this.info.attach("smoke-summary.json", { path: summaryPath, contentType: "application/json" }))
      .catch(() => {});
  }
}

export const test = existingTest.extend<{ smoke: SmokeHarness }>({
  testRunId: async ({}, use, info) => {
    if (process.env.SMOKE_RUN_MANIFEST_PATH) {
      const { readManifest } = await import(pathToFileURL(path.resolve("scripts/smoke-run-resources.mjs")).href);
      const manifest = await readManifest(process.env.SMOKE_RUN_MANIFEST_PATH);
      expect(process.env.APP_TABLE_NAME).toBe(manifest.tables[0].name);
      expect(process.env.AUDIT_TABLE_NAME).toBe(manifest.tables[1].name);
      await use(manifest.runId);
      return;
    }
    await use(`smoke-${randomUUID()}-${info.project.name}-${info.workerIndex}-${info.retry}`.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
  },
  // Replace the injected-page-only collector; SmokeHarness observes all roles and tolerates absent logs.
  diagnostics: async ({}, use) => { await use(); },
  smoke: async ({ playwright, browser, page, baseURL, testRunId }, use, info) => {
    const api = await playwright.request.newContext({ baseURL: baseURL!, timeout: 15_000 });
    const smoke = new SmokeHarness(testRunId, api, browser, page, baseURL!, info);
    try { await use(smoke); }
    finally {
      try { await smoke.finish(); }
      finally { await api.dispose(); }
    }
  }
});

export { expect } from "./fixtures";
