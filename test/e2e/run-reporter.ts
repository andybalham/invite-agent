import type { FullConfig, FullResult, Reporter, TestCase, TestError, TestResult } from "@playwright/test/reporter";
import { appendFileSync, existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Runs after Playwright's worker/context and global teardown paths. The reporter
// owns only diagnostic artifacts; the coordinator remains the manifest writer.
export default class RunReporter implements Reporter {
  private directory: string | null = process.env.E2E_RUN_MANIFEST_PATH ? path.dirname(process.env.E2E_RUN_MANIFEST_PATH) : null;
  private failures: string[] = [];
  private ended = 0;
  private diagnosticFailures: string[] = [];
  private errors: string[] = [];

  onBegin(config: FullConfig): void {
    this.directory = config.metadata.e2e?.mode === "isolated" ? path.dirname(config.metadata.e2e.manifestPath) : null;
  }
  private safe(text: string): string {
    const key = process.env.PUBLIC_TOKEN_HASH_KEY;
    return (key ? text.replaceAll(key, "[REDACTED]") : text).replace(/(\/(?:api\/public\/polls|p)\/)[A-Za-z0-9_-]{32}/g, "$1[REDACTED]");
  }
  private log(text: string): void {
    if (!this.directory || !existsSync(this.directory)) return;
    try { appendFileSync(path.join(this.directory, "playwright.log"), this.safe(text)); }
    catch (error) { this.diagnosticFailures.push(`Playwright log: ${(error as Error).message}`); }
  }
  onStdOut(chunk: string | Buffer): void { this.log(String(chunk)); }
  onStdErr(chunk: string | Buffer): void { this.log(String(chunk)); }
  onError(error: TestError): void { this.errors.push(this.safe(error.message ?? "Runner error")); this.log(`${error.message}\n`); }
  onTestEnd(test: TestCase, result: TestResult): void {
    this.ended += 1;
    this.log(`${test.title}: ${result.status}\n`);
    if (result.status !== test.expectedStatus && result.status !== "skipped") this.failures.push(this.safe(result.errors[0]?.message ?? `${test.title}: ${result.status}`));
  }
  async onEnd(result: FullResult): Promise<void> {
    if (!this.directory || !existsSync(this.directory)) return;
    const file = path.join(this.directory, "summary.json");
    const summary = await readFile(file, "utf8").then((text) => JSON.parse(text)).catch(() => null);
    if (!summary) throw new Error(`Required E2E summary unavailable: ${file}; inspect manifest/logs and preview recovery`);
    summary.playwrightStatus = result.status;
    summary.testExitCode = ["interrupted", "timedout"].includes(result.status) || !this.ended ? null : this.failures.length ? 1 : 0;
    summary.failure ??= this.failures[0] ?? (!summary.cleanupFailure && result.status === "failed" ? this.errors[0] ?? "Playwright failed" : null);
    summary.interruption ??= result.status === "interrupted" ? "Playwright interruption" : null;
    summary.finalExitCode = summary.interruption ? 130 : result.status !== "passed" || summary.cleanupFailure || summary.failure ? 1 : 0;
    summary.diagnosticFailures.push(...this.diagnosticFailures);
    for (const artifact of ["test-results", "playwright-report", "service-logs", "startup.log", "shutdown.log", "table-cleanup.log"]) {
      if (!existsSync(path.join(this.directory, artifact))) summary.diagnosticFailures.push(`Unavailable artifact: ${artifact}`);
    }
    await writeFile(file, `${JSON.stringify(summary, null, 2)}\n`);
  }
}
