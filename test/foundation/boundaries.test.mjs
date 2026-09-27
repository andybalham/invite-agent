import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const checkerUrl = pathToFileURL(
  path.join(repositoryRoot, "scripts/check-production-boundaries.mjs")
).href;

async function loadChecker() {
  try {
    return await import(checkerUrl);
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") {
      assert.fail(
        "the production-boundary checker is absent; implement it before making this test green"
      );
    }
    throw error;
  }
}

async function withFixture(files, callback) {
  const root = await mkdtemp(path.join(tmpdir(), "invite-a-gent-boundary-"));
  try {
    for (const [relativePath, contents] of Object.entries(files)) {
      const absolutePath = path.join(root, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents, "utf8");
    }
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("production code may import shared framework-neutral services", async () => {
  const { findProductionBoundaryViolations } = await loadChecker();
  assert.equal(typeof findProductionBoundaryViolations, "function");

  await withFixture(
    {
      "backend/src/functions/organiser.ts":
        'import { createPoll } from "../domain/create-poll.js";\nexport { createPoll };\n',
      "backend/src/domain/create-poll.ts": "export const createPoll = () => ({ ok: true });\n"
    },
    async (root) => {
      assert.deepEqual(await findProductionBoundaryViolations({ root }), []);
    }
  );
});

test("production code cannot import a local-only adapter", async () => {
  const { findProductionBoundaryViolations } = await loadChecker();

  await withFixture(
    {
      "backend/src/functions/public.ts":
        'import { authenticate } from "../adapters/local/authentication.js";\nexport { authenticate };\n',
      "backend/src/adapters/local/authentication.ts":
        "export const authenticate = () => ({ organiserId: 'local-user' });\n"
    },
    async (root) => {
      const violations = await findProductionBoundaryViolations({ root });
      assert.equal(violations.length, 1);
      assert.match(violations[0].file, /backend[\\/]src[\\/]functions[\\/]public\.ts$/);
      assert.match(violations[0].specifier, /adapters[\\/]local/);
    }
  );
});
