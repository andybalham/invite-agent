import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const domainUrl = pathToFileURL(path.join(root, "backend/dist/domain/participant-name.js")).href;

test("participant names trim only their edges and preserve internal whitespace", async () => {
  const { validateParticipantName } = await import(domainUrl);
  assert.deepEqual(validateParticipantName("  Alice  Cooper  "), {
    success: true,
    displayName: "Alice  Cooper",
    normalizedName: "alice  cooper"
  });
});

test("participant name keys use NFKC and locale-independent case folding", async () => {
  const { normalizeParticipantName } = await import(domainUrl);
  assert.equal(normalizeParticipantName("ＡＬＩＣＥ"), "alice");
  assert.equal(normalizeParticipantName("Straße"), normalizeParticipantName("STRASSE"));
  assert.equal(normalizeParticipantName("ΟΣ"), normalizeParticipantName("οσ"));
});

test("participant names are required and limited to 100 Unicode code points", async () => {
  const { validateParticipantName } = await import(domainUrl);
  assert.equal(validateParticipantName(" \n ").success, false);
  assert.equal(validateParticipantName("😀".repeat(100)).success, true);
  assert.equal(validateParticipantName("😀".repeat(101)).success, false);
});

test("participant names reject non-string input and unsafe control characters", async () => {
  const { validateParticipantName } = await import(domainUrl);
  assert.equal(validateParticipantName(42).success, false);
  assert.equal(validateParticipantName("Alice\u0000Admin").success, false);
});
