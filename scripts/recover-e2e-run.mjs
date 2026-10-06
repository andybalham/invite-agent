import path from "node:path";
import { fileURLToPath } from "node:url";
import { previewE2ERecovery, recoverE2ERun } from "./e2e-run-cleanup.mjs";

export async function recoverCommand(args) {
  const [operation, file, confirmation, runId] = args;
  if (!file || !path.isAbsolute(file)) throw new Error("Select an absolute v2 manifest path; no discovery or environment targets are allowed");
  if (operation === "preview" && args.length === 2) return previewE2ERecovery(file);
  if (operation === "cleanup" && confirmation === "--confirm-run" && runId && args.length === 4) return recoverE2ERun(file, runId);
  throw new Error("Usage: node scripts/recover-e2e-run.mjs preview <absolute-manifest> | cleanup <absolute-manifest> --confirm-run <previewed-run-id>");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await recoverCommand(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.recoveryRequired || result.tables.some(({ state }) => state === "refused")) process.exitCode = 1;
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
