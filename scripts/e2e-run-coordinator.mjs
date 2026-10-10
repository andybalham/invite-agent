import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { assertEffectiveEnvironment, e2eEnvironment } from "../backend/dist/adapters/local/e2e-config.js";
import { createE2EManifest, readE2EManifest, provisionE2ETables, saveE2EManifest } from "../backend/dist/adapters/local/e2e-resources.js";
import { preflightE2E, processStartTime } from "../backend/dist/adapters/local/e2e-runtime.js";
import { finishE2ERun } from "./e2e-run-cleanup.mjs";

export async function assertFreePort(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", () => reject(new Error(`E2E service port ${port} is occupied; select a separate API_PORT/WEB_PORT`)));
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

// The coordinator alone writes the manifest. Worker poll inventories are separate
// artifacts (fixtures never read/modify/write this shared journal).
export async function startE2ERun(config, { root = process.cwd(), environment = process.env } = {}) {
  // Disposable runs provision once; shared data always requires the caller's persistent ring.
  if (config.mode === "isolated" && environment.PUBLIC_TOKEN_ENCRYPTION_ACTIVE_KEY_ID === undefined &&
      environment.PUBLIC_TOKEN_ENCRYPTION_KEYS === undefined) {
    environment.PUBLIC_TOKEN_ENCRYPTION_ACTIVE_KEY_ID = "e2e";
    environment.PUBLIC_TOKEN_ENCRYPTION_KEYS = JSON.stringify({ e2e: randomBytes(32).toString("base64url") });
  }
  const effective = e2eEnvironment(config, environment);
  assertEffectiveEnvironment(config, effective);
  if (config.mode !== "isolated") {
    Object.assign(environment, effective);
    if (config.mode === "shared") process.stderr.write(`WARNING: SHARED E2E DATA RETAINED at ${config.endpoint}: ${config.appTableName}, ${config.auditTableName}\n`);
    await preflightE2E(environment);
    return async () => {};
  }
  if (environment.E2E_COORDINATOR_PID !== String(process.pid)) throw new Error("E2E requires a fresh current coordinator; do not reuse a prior run environment");
  await assertFreePort(config.apiPort);
  await assertFreePort(config.webPort);
  const runDirectory = path.dirname(config.manifestPath);
  if (path.resolve(root, ".devstack/e2e-runs", config.runId) !== runDirectory) throw new Error("E2E evidence directory must belong to the current repository/run");
  await mkdir(path.dirname(runDirectory), { recursive: true });
  await mkdir(runDirectory); // Exclusive: never overwrite another invocation.
  if (await realpath(runDirectory) !== runDirectory) throw new Error("E2E evidence directory must not alias another run");
  const logs = path.join(runDirectory, "service-logs");
  await mkdir(logs);
  const coordinator = { pid: process.pid, startTimeUtcFileTime: await processStartTime(process.pid), runId: config.runId, manifestPath: config.manifestPath };
  let manifest = await createE2EManifest(config, coordinator, process.argv.slice(2));
  const children = [];
  const streams = [];
  let stopping;
  let interruption = null;
  let startupFailure = null;
  // Playwright handles SIGINT by stopping workers and running global finalizers.
  // Observe it without racing a second teardown; relay catchable SIGTERM through
  // that same worker/context flush path. Forced termination remains recoverable.
  const onInterrupt = () => { interruption ??= "SIGINT"; };
  const onTerminate = () => { interruption = "SIGTERM"; process.emit("SIGINT"); };
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  const stop = () => stopping ??= (async () => {
    try {
      const summary = await finishE2ERun(config.manifestPath, {
        interruption, failure: startupFailure,
        writerErrors: children.filter(({ child, identity }) => !identity && child.pid && child.exitCode === null && child.signalCode === null)
          .map(({ child }) => `Unverified child ${child.pid}; retained, table deletion deferred`),
        flushLogs: async () => {
          const errors = [];
          for (const stream of streams) {
            if (stream.destroyed) { if (stream.errored) errors.push(stream.errored.message); continue; }
            await new Promise((resolve) => {
              const timer = setTimeout(() => { errors.push("Service log flush timed out"); resolve(); }, 2000);
              const done = () => { clearTimeout(timer); resolve(); };
              stream.once("close", done);
              stream.once("error", (error) => { errors.push(error.message); done(); });
              stream.end();
            });
          }
          return errors;
        }
      });
      if (summary.cleanupFailure) throw new Error(summary.cleanupFailure);
    } finally {
      process.off("SIGINT", onInterrupt);
      process.off("SIGTERM", onTerminate);
    }
  })();
  async function launch(role, args, cwd = root) {
    const out = createWriteStream(path.join(logs, `${role}.out.log`));
    const error = createWriteStream(path.join(logs, `${role}.error.log`));
    // Log I/O failure is diagnostic; retain it without crashing the coordinator.
    out.on("error", () => {});
    error.on("error", () => {});
    streams.push(out, error);
    const child = spawn(process.execPath, args, { cwd, env: effective, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.pipe(out);
    child.stderr.pipe(error);
    const record = { child, identity: null };
    children.push(record);
    await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    const identity = { role, pid: child.pid, startTimeUtcFileTime: await processStartTime(child.pid), runId: config.runId, manifestPath: config.manifestPath };
    record.identity = identity;
    manifest.services.processes.push(identity);
    await saveE2EManifest(config.manifestPath, manifest);
    return child;
  }
  try {
    Object.assign(environment, effective);
    process.stdout.write(`E2E evidence: ${runDirectory}\n`);
    await provisionE2ETables(config.manifestPath);
    manifest = await readE2EManifest(config.manifestPath);
    manifest.phase = "starting";
    await saveE2EManifest(config.manifestPath, manifest);
    await launch("api", ["backend/dist/adapters/local/dev-server.js"]);
    // Vite's Windows config resolution is sensitive to the process cwd. Start
    // it inside the frontend workspace and use an absolute entrypoint; passing
    // `frontend` from the repository root makes it resolve ../../.. incorrectly.
    await launch("web", [path.resolve(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(config.webPort), "--strictPort"], path.resolve(root, "frontend"));
    const deadline = Date.now() + 30_000;
    let lastError;
    while (Date.now() < deadline) {
      if (children.some(({ child }) => child.exitCode !== null || child.signalCode !== null)) throw new Error(`E2E service exited during startup; inspect ${logs}`);
      try { await preflightE2E(environment); lastError = null; break; }
      catch (error) { lastError = error; await delay(200); }
    }
    if (lastError) throw lastError;
    manifest.phase = "testing";
    await saveE2EManifest(config.manifestPath, manifest);
    await writeFile(path.join(runDirectory, "startup.log"), "Owned tables and API/web configuration verified.\n");
    return stop;
  } catch (error) {
    startupFailure = error.message;
    await writeFile(path.join(runDirectory, "startup.log"), `${error.message}\n`).catch(() => {});
    // Reload creation evidence after partial provisioning; never erase its flags.
    await stop().catch((cleanupError) => process.stderr.write(`${cleanupError.message}\n`));
    throw error;
  }
}
