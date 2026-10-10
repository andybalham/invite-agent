import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import test from "node:test";
import {
  AesGcmPublicTokenCipher, createPublicToken, encodePublicTokenEncryptionContext,
  hashPublicToken, isEncryptedPublicToken, readPublicTokenEncryptionConfig
} from "../../backend/dist/security/index.js";
import { PollService } from "../../backend/dist/application/poll-service.js";
import { DynamoPollRepository } from "../../backend/dist/data/dynamodb-poll-repository.js";
import { readLocalConfig } from "../../backend/dist/adapters/local/config.js";
import { createLocalComposition } from "../../backend/dist/adapters/local/composition.js";
import { testPublicTokenCipher } from "../support/public-token-encryption.mjs";

const hashKey = "recoverable-publication-test-hmac";
const token = createPublicToken();
const context = { pollId: "poll-1", organiserId: "owner-1", publicTokenHash: hashPublicToken(token, hashKey) };
const draft = { id: context.pollId, organiserId: context.organiserId, title: "Dinner", status: "draft",
  version: 1, participantCount: 0, timeZone: "Europe/London", createdAt: "2026-10-10T00:00:00.000Z",
  proposedDates: [{ kind: "date", localDate: "2026-11-10" }, { kind: "date", localDate: "2026-11-11" }] };

test("AES-GCM round trips with fresh IVs and retains old-key reads across ring rotation", () => {
  const old = randomBytes(32).toString("base64url");
  const current = randomBytes(32).toString("base64url");
  const config = (active, keys) => readPublicTokenEncryptionConfig({
    PUBLIC_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: active, PUBLIC_TOKEN_ENCRYPTION_KEYS: JSON.stringify(keys)
  }, hashKey);
  const oldCipher = new AesGcmPublicTokenCipher(config("old", { old }));
  const rotated = new AesGcmPublicTokenCipher(config("current", { old, current }));
  const envelopes = Array.from({ length: 128 }, () => oldCipher.encrypt(token, context));
  assert.equal(new Set(envelopes.map(({ iv }) => iv)).size, envelopes.length);
  for (const envelope of envelopes) {
    assert.equal(isEncryptedPublicToken(envelope), true);
    assert.equal(JSON.stringify(envelope).includes(token), false);
    assert.equal(rotated.decrypt(envelope, context), token);
  }
  const latest = rotated.encrypt(token, context);
  assert.equal(latest.keyId, "current");
  assert.equal(rotated.decrypt(latest, context), token);
  assert.throws(() => oldCipher.decrypt(latest, context), { message: "Public token decryption failed" });
});

test("cipher rejects tampering, unknown keys, malformed storage and every swapped context", () => {
  const cipher = testPublicTokenCipher();
  const envelope = cipher.encrypt(token, context);
  for (const field of ["iv", "ciphertext", "authTag"]) {
    const bytes = Buffer.from(envelope[field], "base64url");
    bytes[0] ^= 1;
    assert.throws(() => cipher.decrypt({ ...envelope, [field]: bytes.toString("base64url") }, context),
      { message: "Public token decryption failed" });
  }
  for (const value of [null, {}, { ...envelope, version: 2 }, { ...envelope, keyId: "unknown" },
    { ...envelope, authTag: envelope.authTag + "=" }, { ...envelope, plaintext: token }]) {
    assert.throws(() => cipher.decrypt(value, context), { message: "Public token decryption failed" });
  }
  for (const change of [{ pollId: "other" }, { organiserId: "other" }, { publicTokenHash: "b".repeat(64) }]) {
    assert.throws(() => cipher.decrypt(envelope, { ...context, ...change }), { message: "Public token decryption failed" });
  }
  assert.throws(() => cipher.encrypt("short", context), { message: "Public token encryption failed" });
});

test("authenticated but invalid plaintext fails closed after final authentication", () => {
  const config = readPublicTokenEncryptionConfig({ PUBLIC_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "test",
    PUBLIC_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ test: randomBytes(32).toString("base64url") }) }, hashKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", config.keys.get("test"), iv, { authTagLength: 16 });
  cipher.setAAD(encodePublicTokenEncryptionContext(context));
  const ciphertext = Buffer.concat([cipher.update("!".repeat(32)), cipher.final()]);
  assert.throws(() => new AesGcmPublicTokenCipher(config).decrypt({ version: 1, algorithm: "aes-256-gcm",
    keyId: "test", iv: iv.toString("base64url"), ciphertext: ciphertext.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url") }, context), { message: "Public token decryption failed" });
});

test("missing or failed encryption prevents publication writes and exposes no diagnostics", async () => {
  const writes = [];
  const repository = { getPoll: async () => structuredClone(draft), publishPoll: async (...args) => writes.push(args) };
  for (const publicTokenCipher of [undefined, { encrypt() { throw new Error("private-key-or-token-diagnostic"); } }]) {
    const service = new PollService(repository, { baseUrl: "https://example.com", tokenHashKey: hashKey, publicTokenCipher });
    await assert.rejects(service.publish(draft.id, draft.organiserId),
      { message: "The poll could not be published" });
  }
  assert.deepEqual(writes, []);
});

test("publication transaction stores hash/envelope only in metadata and rejects hash-only writes", async () => {
  const commands = [];
  const repository = new DynamoPollRepository({ send: async (command) => { commands.push(command); return {}; } },
    { appTableName: "app", auditTableName: "audit" });
  repository.getPoll = async () => structuredClone(draft);
  const cipher = testPublicTokenCipher();
  const service = new PollService(repository, { baseUrl: "https://example.com", tokenHashKey: hashKey, publicTokenCipher: cipher });
  const result = await service.publish(draft.id, draft.organiserId);
  const issuedToken = result.publicUrl.split("/").at(-1);
  assert.equal(commands.length, 1);
  const [metadata, capability, audit] = commands[0].input.TransactItems.map(({ Put }) => Put);
  const poll = JSON.parse(metadata.Item.document.S);
  assert.equal(poll.publicTokenHash, hashPublicToken(issuedToken, hashKey));
  assert.equal(cipher.decrypt(poll.encryptedPublicToken, { ...context, publicTokenHash: poll.publicTokenHash }), issuedToken);
  assert.match(metadata.ConditionExpression, /#version = :previousVersion.*#status = :draft/);
  assert.equal(metadata.ExpressionAttributeValues[":previousVersion"].N, "1");
  assert.equal(metadata.ExpressionAttributeValues[":draft"].S, "draft");
  assert.deepEqual(Object.keys(capability.Item).sort(), ["PK", "SK", "pollId", "state"]);
  assert.match(capability.ConditionExpression, /attribute_not_exists/);
  for (const item of [capability.Item, audit.Item]) {
    for (const secret of [issuedToken, poll.encryptedPublicToken.ciphertext, "encryptedPublicToken"]) {
      assert.equal(JSON.stringify(item).includes(secret), false);
    }
  }
  assert.equal(JSON.stringify(result.poll).includes("encryptedPublicToken"), false);
  for (const invalid of [{ ...poll, encryptedPublicToken: undefined }, { ...poll, publicTokenHash: undefined },
    { ...poll, publicTokenHash: "bad" }, { ...poll, status: "draft" }, { ...poll, encryptedPublicToken: {} }]) {
    await assert.rejects(repository.publishPoll(invalid, {}), /Invalid publication token storage/);
  }
  assert.equal(commands.length, 1);
});

test("persistent local composition requires explicit encryption keys in every environment", async () => {
  for (const appEnv of ["local", "test"]) {
    const config = { appEnv, authMode: "local", awsRegion: "eu-west-2", dynamodbEndpoint: "http://127.0.0.1:18000",
      appTableName: "app", auditTableName: "audit", publicBaseUrl: "http://127.0.0.1:15173" };
    await assert.rejects(createLocalComposition(config), { message: "Invalid public token encryption configuration" });
    assert.throws(() => readLocalConfig({ APP_ENV: appEnv, AUTH_MODE: "local", AWS_REGION: config.awsRegion,
      DYNAMODB_ENDPOINT: config.dynamodbEndpoint, APP_TABLE_NAME: "app", AUDIT_TABLE_NAME: "audit", PUBLIC_BASE_URL: config.publicBaseUrl }),
    { message: "Invalid public token encryption configuration" });
  }
});
