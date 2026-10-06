import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { observeProcess } from "../../backend/dist/adapters/local/e2e-runtime.js";

export async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

// Hash every original artifact, including binary traces, screenshots and video.
// Recovery adds its own directory and appends to the manifest journal only.
export async function evidenceSnapshot(directory) {
  const files = {};
  async function visit(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (folder === directory && ["manifest.json", "recovery", "recovery.lock"].includes(entry.name)) continue;
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) files[path.relative(directory, file).replaceAll("\\", "/")] = createHash("sha256").update(await readFile(file)).digest("hex");
    }
  }
  await visit(directory);
  return files;
}

export async function assertFailureEvidence(directory, { media = true } = {}) {
  const files = await evidenceSnapshot(directory);
  for (const name of ["startup.log", "playwright.log", "shutdown.log", "table-cleanup.log", "summary.json", "playwright-report/index.html",
    "service-logs/api.out.log", "service-logs/api.error.log", "service-logs/web.out.log", "service-logs/web.error.log"]) assert.ok(files[name], `Missing ${name}`);
  if (media) for (const suffix of ["/trace.zip", ".png", ".webm", "/api.log"]) {
    assert.ok(Object.keys(files).some((name) => name.startsWith("test-results/") && name.endsWith(suffix)), `Missing failure artifact ${suffix}`);
  }
  return files;
}

export async function runCleanupProbe(endpoint, { mode = "pass", repeat = 1, retries = 0, browserMissing = false } = {}) {
  const apiPort = await freePort();
  let webPort = await freePort();
  while (webPort === apiPort || webPort === Number(new URL(endpoint).port)) webPort = await freePort();
  const environment = { ...process.env, APP_ENV: "local", AUTH_MODE: "local", E2E_ALLOW_SHARED_TABLES: "0",
    DYNAMODB_ENDPOINT: endpoint, DYNAMODB_PORT: new URL(endpoint).port, API_PORT: String(apiPort), WEB_PORT: String(webPort),
    APP_TABLE_NAME: "invite-agent-local-app", AUDIT_TABLE_NAME: "caller-audit", AWS_REGION: "us-east-1",
    PUBLIC_TOKEN_HASH_KEY: "cleanup-verification-private-key", HARNESS_CLEANUP_PROBE: mode };
  for (const key of ["E2E_MODE", "E2E_RUN_ID", "E2E_RUN_MANIFEST_PATH", "E2E_COORDINATOR_PID", "E2E_API_INSTANCE_ID", "SMOKE_RUN_MANIFEST_PATH", "PUBLIC_BASE_URL"]) delete environment[key];
  if (browserMissing) environment.PLAYWRIGHT_BROWSERS_PATH = path.resolve(".devstack", "missing-browser-for-cleanup-verification");
  const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "test/e2e/cleanup-isolation.spec.ts",
    "--workers=2", `--repeat-each=${repeat}`, `--retries=${retries}`], { env: environment, windowsHide: true, timeout: 90_000, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const exit = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  const directory = /E2E evidence: ([^\r\n]+)/.exec(output)?.[1];
  assert.ok(directory, output);
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  const summary = JSON.parse(await readFile(path.join(directory, "summary.json"), "utf8"));
  assert.equal(manifest.configuration.apiPort, apiPort);
  assert.equal(manifest.configuration.webPort, webPort);
  assert.equal(manifest.region, "us-east-1");
  assert.equal(summary.finalExitCode, exit, output);
  for (const { pid } of manifest.services.processes) assert.equal(await observeProcess(pid), null, `Run-owned writer ${pid} is still live`);
  assert.ok(!JSON.stringify(manifest).includes(environment.PUBLIC_TOKEN_HASH_KEY));
  return { directory, manifest, summary, exit, output };
}
