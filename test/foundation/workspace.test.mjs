import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requiredWorkspaces = Object.freeze([
  "frontend",
  "backend",
  "infra",
  "packages/contracts",
  "scripts",
  "test"
]);

async function readJson(relativePath) {
  const contents = await readFile(path.join(repositoryRoot, relativePath), "utf8");
  return JSON.parse(contents);
}

test("root manifest exposes every architecture workspace", async () => {
  const manifest = await readJson("package.json");

  assert.deepEqual(
    [...(manifest.workspaces ?? [])].sort(),
    [...requiredWorkspaces].sort(),
    "Architecture §14 and S-001 require frontend, backend, infra, contracts, scripts, and test workspaces"
  );

  for (const workspace of requiredWorkspaces) {
    const childManifest = await readJson(path.join(workspace, "package.json"));
    assert.equal(childManifest.private, true, `${workspace} must be an internal workspace package`);
  }
});

test("root commands cover formatting, linting, type checking, unit tests, and boundaries", async () => {
  const manifest = await readJson("package.json");
  const requiredCommands = ["format:check", "lint", "typecheck", "test:unit", "test:boundaries"];

  for (const command of requiredCommands) {
    assert.equal(
      typeof manifest.scripts?.[command],
      "string",
      `root package.json must define ${command}`
    );
  }
});

test("the lock file captures every workspace and the package manager is pinned", async () => {
  const manifest = await readJson("package.json");
  const lock = await readJson("package-lock.json");

  assert.match(manifest.packageManager ?? "", /^npm@\d+\.\d+\.\d+$/);
  assert.equal(lock.lockfileVersion, 3);
  for (const workspace of requiredWorkspaces) {
    assert.ok(lock.packages?.[workspace], `${workspace} must be represented in package-lock.json`);
  }
});
