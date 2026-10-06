import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { assertEffectiveEnvironment, e2eEnvironment } from "../backend/dist/adapters/local/e2e-config.js";
import { createE2EManifest, readE2EManifest, provisionE2ETables, saveE2EManifest } from "../backend/dist/adapters/local/e2e-resources.js";
import { preflightE2E, processStartTime } from "../backend/dist/adapters/local/e2e-runtime.js";

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
  let stopped = false;
  // Register shutdown before provisioning; table teardown/recovery is T-132.
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    const failures = [];
    for (const { child, identity } of children.toReversed()) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      try {
        if (!identity) throw new Error(`E2E child ${child.pid} has no verified start time; inspect retained process`);
        if (await processStartTime(child.pid) !== identity.startTimeUtcFileTime) throw new Error(`E2E ${identity.role} process identity changed; retained`);
        const exited = new Promise((resolve) => child.once("exit", resolve));
        child.kill("SIGTERM");
        await Promise.race([exited, delay(5000).then(() => { throw new Error(`E2E ${identity.role} did not stop`); })]);
      } catch (error) { failures.push(error.message); }
    }
    for (const stream of streams) stream.end();
    manifest.finishedAt = new Date().toISOString();
    manifest.phase = "teardown";
    await saveE2EManifest(config.manifestPath, manifest);
    await writeFile(path.join(runDirectory, "shutdown.log"), `${failures.length ? failures.join("\n") : "Run-owned API/web writers stopped."}\nTable teardown remains pending (T-132); tables and manifest retained.\n`);
    if (failures.length) throw new Error(failures.join("; "));
  };
  async function launch(role, args, cwd = root) {
    const out = createWriteStream(path.join(logs, `${role}.out.log`));
    const error = createWriteStream(path.join(logs, `${role}.error.log`));
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
    await writeFile(path.join(runDirectory, "startup.log"), `${error.message}\n`).catch(() => {});
    // Reload creation evidence after partial provisioning; never erase its flags.
    manifest = await readE2EManifest(config.manifestPath);
    await stop().catch((cleanupError) => process.stderr.write(`${cleanupError.message}\n`));
    throw error;
  }
}
