import { test as base } from "@playwright/test";
import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { E2EConfiguration } from "../../backend/src/adapters/local/e2e-config";

export async function validatedE2EConfiguration(): Promise<E2EConfiguration> {
  const moduleUrl = pathToFileURL(path.resolve("backend/dist/adapters/local/e2e-runtime.js")).href;
  const { preflightE2E } = await import(moduleUrl);
  return preflightE2E(process.env);
}

export function serviceLogsDirectory(): string {
  return process.env.E2E_RUN_MANIFEST_PATH ? path.join(path.dirname(process.env.E2E_RUN_MANIFEST_PATH), "service-logs") : path.resolve(".devstack/service-logs");
}

type HarnessFixtures = {
  e2eConfiguration: E2EConfiguration;
  testRunId: string;
  diagnostics: void;
};

export const test = base.extend<HarnessFixtures>({
  e2eConfiguration: [async ({}, use) => {
    await use(await validatedE2EConfiguration());
  }, { auto: true }],
  context: async ({ context, e2eConfiguration }, use) => {
    void e2eConfiguration;
    await context.setExtraHTTPHeaders({ "x-local-e2e-instance": process.env.E2E_API_INSTANCE_ID! });
    await use(context);
  },
  request: async ({ playwright, baseURL, e2eConfiguration }, use) => {
    if (baseURL !== e2eConfiguration.webOrigin) throw new Error("E2E request baseURL differs from validated web origin");
    const request = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "x-local-e2e-instance": process.env.E2E_API_INSTANCE_ID! } });
    try { await use(request); }
    finally { await request.dispose(); }
  },
  testRunId: async ({}, use, testInfo) => {
    const slug = testInfo.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    await use(`${testInfo.project.name}-${testInfo.workerIndex}-${testInfo.retry}-${slug}`);
  },
  diagnostics: [
    async ({ page }, use, testInfo) => {
      const apiLog: string[] = [];
      const safeUrl = (value: string): string =>
        value.replace(/(\/api\/public\/polls\/)[A-Za-z0-9_-]{32}(?=\/|$)/, "$1[REDACTED]");
      page.on("response", (response) => {
        if (/\/(api|health)(\/|$)/.test(new URL(response.url()).pathname)) {
          apiLog.push(`${response.status()} ${response.request().method()} ${safeUrl(response.url())}`);
        }
      });
      page.on("requestfailed", (request) => {
        apiLog.push(
          `FAILED ${request.method()} ${safeUrl(request.url())} ${request.failure()?.errorText ?? ""}`
        );
      });

      await use();

      if (testInfo.status !== testInfo.expectedStatus) {
        await mkdir(testInfo.outputDir, { recursive: true });
        const apiLogPath = path.join(testInfo.outputDir, "api.log");
        await writeFile(apiLogPath, `${apiLog.join("\n")}\n`, "utf8");
        await testInfo.attach("api.log", { path: apiLogPath, contentType: "text/plain" });

        const serviceLogs = serviceLogsDirectory();
        const copiedLogs = path.join(testInfo.outputDir, "service-logs");
        await cp(serviceLogs, copiedLogs, { recursive: true, force: true }).catch(() => {});
        for (const logName of await readdir(copiedLogs).catch(() => [])) {
          await testInfo.attach(`service-${logName}`, {
            path: path.join(copiedLogs, logName),
            contentType: "text/plain"
          });
        }
      }
    },
    { auto: true }
  ]
});

export { expect } from "@playwright/test";
