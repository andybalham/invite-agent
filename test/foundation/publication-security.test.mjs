import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tokenUrl = pathToFileURL(path.join(root, "backend/dist/security/public-token.js")).href;

test("public capabilities contain exactly 192 random bits in canonical Base64URL", async () => {
  const { createPublicToken, hashPublicToken, isPublicToken } = await import(tokenUrl);
  const tokens = new Set(Array.from({ length: 128 }, () => createPublicToken()));

  assert.equal(tokens.size, 128);
  for (const token of tokens) {
    assert.equal(Buffer.from(token, "base64url").byteLength, 24);
    assert.match(token, /^[A-Za-z0-9_-]{32}$/);
    assert.equal(isPublicToken(token), true);
  }
  assert.equal(isPublicToken("1"), false);
  assert.equal(isPublicToken("A".repeat(31)), false);
  assert.equal(hashPublicToken([...tokens][0], "test-key"), hashPublicToken([...tokens][0], "test-key"));
  assert.notEqual(hashPublicToken([...tokens][0], "test-key"), hashPublicToken([...tokens][0], "other-key"));
});
