import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";
import { readE2EManifest, saveE2EManifest } from "../../backend/dist/adapters/local/e2e-resources.js";
import { fixture } from "../support/e2e-resource-fixture.mjs";

function mockRename(t, implementation) {
  const rename = fs.rename;
  const mocked = t.mock.method(fs, "rename", (...args) => implementation(rename, ...args));
  syncBuiltinESMExports();
  t.after(() => { mocked.mock.restore(); syncBuiltinESMExports(); });
  return mocked;
}

test("transient manifest replacement failures retry the same complete journal and preserve atomic publication", async (t) => {
  const { file, manifest } = await fixture(t);
  const original = await fs.readFile(file, "utf8");
  manifest.phase = "provisioning";
  let temporary;
  let attempts = 0;
  mockRename(t, async (rename, source, destination) => {
    temporary ??= source;
    assert.equal(source, temporary);
    assert.equal(destination, file);
    assert.equal(await fs.readFile(file, "utf8"), original);
    assert.deepEqual(JSON.parse(await fs.readFile(source, "utf8")), manifest);
    attempts += 1;
    if (attempts <= 2) throw Object.assign(new Error("journal temporarily busy"), { code: "EPERM" });
    return rename(source, destination);
  });
  await saveE2EManifest(file, manifest);
  assert.equal(attempts, 3);
  assert.deepEqual(await readE2EManifest(file), manifest);
  await assert.rejects(fs.readFile(temporary), { code: "ENOENT" });
});

test("persistent replacement errors stay bounded and unrelated I/O errors fail immediately without altering the live manifest", async (t) => {
  for (const [code, expectedAttempts] of [["EPERM", 5], ["EACCES", 5], ["EBUSY", 5], ["ENOSPC", 1]]) {
    await t.test(code, async (t) => {
      const { file, manifest } = await fixture(t);
      const original = await fs.readFile(file, "utf8");
      manifest.phase = "provisioning";
      const failure = Object.assign(new Error("injected manifest replacement failure"), { code });
      let temporary;
      const mocked = mockRename(t, async (_rename, source) => { temporary = source; throw failure; });
      await assert.rejects(saveE2EManifest(file, manifest), (error) => error === failure);
      assert.equal(mocked.mock.callCount(), expectedAttempts);
      assert.equal(await fs.readFile(file, "utf8"), original);
      assert.deepEqual(JSON.parse(await fs.readFile(temporary, "utf8")), manifest);
    });
  }
});
