import type { FullConfig } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";

export default async function globalSetup(config: FullConfig) {
  await promisify(execFile)(process.execPath, ["node_modules/typescript/bin/tsc", "-b", "--pretty", "false"], { cwd: process.cwd(), windowsHide: true });
  const moduleUrl = pathToFileURL(path.resolve("scripts/e2e-run-coordinator.mjs")).href;
  const { startE2ERun } = await import(moduleUrl);
  return startE2ERun(config.metadata.e2e);
}
