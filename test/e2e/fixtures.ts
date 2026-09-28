import { test as base } from "@playwright/test";
import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

type HarnessFixtures = {
  testRunId: string;
  diagnostics: void;
};

export const test = base.extend<HarnessFixtures>({
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

        const serviceLogs = path.resolve(".devstack/service-logs");
        const copiedLogs = path.join(testInfo.outputDir, "service-logs");
        await cp(serviceLogs, copiedLogs, { recursive: true, force: true });
        for (const logName of await readdir(copiedLogs)) {
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
