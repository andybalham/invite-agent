import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import * as contracts from "../../packages/contracts/dist/index.js";
import {
  encodePublicTokenEncryptionContext,
  isEncryptedPublicToken,
  readPublicTokenEncryptionConfig
} from "../../backend/dist/security/index.js";
import { toOwnedPollSummary } from "../../backend/dist/domain/my-polls.js";
import { PollService } from "../../backend/dist/application/poll-service.js";

const token = "A".repeat(32);
const publicUrl = `https://invite-agent.example/p/${token}`;
const envelope = {
  version: 1, algorithm: "aes-256-gcm", keyId: "key-2026",
  iv: randomBytes(12).toString("base64url"),
  ciphertext: randomBytes(32).toString("base64url"),
  authTag: randomBytes(16).toString("base64url")
};
const context = { pollId: "poll-1", organiserId: "owner-1", publicTokenHash: "a".repeat(64) };

test("persisted envelope accepts only the versioned GCM shape and canonical byte lengths", () => {
  assert.equal(isEncryptedPublicToken(envelope), true);
  for (const key of Object.keys(envelope)) {
    const missing = { ...envelope };
    delete missing[key];
    assert.equal(isEncryptedPublicToken(missing), false);
  }
  for (const value of [null, [], { ...envelope, version: 2 }, { ...envelope, algorithm: "aes-256-cbc" },
    { ...envelope, keyId: "" }, { ...envelope, keyId: "k".repeat(65) }, { ...envelope, keyId: "key\n" },
    ...["iv", "ciphertext", "authTag"].flatMap((key) => [
      { ...envelope, [key]: `${envelope[key]}=` }, { ...envelope, [key]: `${envelope[key]}\n` },
      { ...envelope, [key]: randomBytes(8).toString("base64url") }
    ]), { ...envelope, publicToken: token }]) assert.equal(isEncryptedPublicToken(value), false);
  // Shape validation does not assert authenticity; the cipher must verify the tag.
  assert.equal(isEncryptedPublicToken({ ...envelope, ciphertext: randomBytes(32).toString("base64url") }), true);
});

test("AAD has stable ordering and binds owner, poll and hash without delimiter ambiguity", () => {
  const encoded = encodePublicTokenEncryptionContext(context);
  assert.equal(encoded.toString("utf8"), JSON.stringify([
    "invite-agent/public-token", 1, "poll-1", "owner-1", "a".repeat(64)
  ]));
  assert.deepEqual(encodePublicTokenEncryptionContext({ ...context }), encoded);
  for (const change of [{ pollId: "poll-2" }, { organiserId: "owner-2" }, { publicTokenHash: "b".repeat(64) }]) {
    assert.notDeepEqual(encodePublicTokenEncryptionContext({ ...context, ...change }), encoded);
  }
  assert.notDeepEqual(
    encodePublicTokenEncryptionContext({ ...context, pollId: "a:b", organiserId: "c" }),
    encodePublicTokenEncryptionContext({ ...context, pollId: "a", organiserId: "b:c" })
  );
  for (const change of [{ pollId: " " }, { organiserId: "" }, { publicTokenHash: "bad" }]) {
    assert.throws(() => encodePublicTokenEncryptionContext({ ...context, ...change }), /Invalid public token encryption context/);
  }
});

test("explicit key ring retains old read keys and requires an independent active 256-bit key", () => {
  const current = randomBytes(32).toString("base64url");
  const previous = randomBytes(32).toString("base64url");
  const environment = {
    PUBLIC_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "current",
    PUBLIC_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ current, previous })
  };
  const config = readPublicTokenEncryptionConfig(environment, "separate-hmac-key");
  assert.equal(config.activeKeyId, "current");
  assert.equal(config.keys.size, 2);
  assert.equal(config.keys.get("current").type, "secret");
  assert.deepEqual(config.keys.get("previous").export(), Buffer.from(previous, "base64url"));
  const failures = [
    {}, { ...environment, PUBLIC_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "missing" },
    { ...environment, PUBLIC_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "invalid key id" },
    ...["", current, "[", "null", "[]", "{}",
      JSON.stringify({ current: "short" }), JSON.stringify({ current: `${current}=` }),
      JSON.stringify({ current, previous: current }), JSON.stringify({ current, "bad id": previous })
    ].map((PUBLIC_TOKEN_ENCRYPTION_KEYS) => ({ ...environment, PUBLIC_TOKEN_ENCRYPTION_KEYS }))
  ];
  for (const appEnv of ["local", "test", "production"]) {
    for (const input of failures) {
      assert.throws(() => readPublicTokenEncryptionConfig({ ...input, APP_ENV: appEnv }, "separate-hmac-key"),
        { message: "Invalid public token encryption configuration" });
    }
  }
  for (const hashKey of ["", " ", current]) {
    assert.throws(() => readPublicTokenEncryptionConfig(environment, hashKey),
      { message: "Invalid public token encryption configuration" });
  }
  const utf8HashKey = "x".repeat(32);
  assert.throws(() => readPublicTokenEncryptionConfig({ ...environment,
    PUBLIC_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ current: Buffer.from(utf8HashKey).toString("base64url") })
  }, utf8HashKey), { message: "Invalid public token encryption configuration" });
});

test("owner share response permits only a canonical public URL and excludes internal data", () => {
  for (const url of [publicUrl, `http://127.0.0.1:15173/p/${token}`, `http://localhost:15173/p/${token}`,
    `http://[::1]:15173/p/${token}`]) {
    assert.deepEqual(contracts.ownedPollShareResponseSchema.safeParse({ publicUrl: url }),
      { success: true, data: { publicUrl: url } });
  }
  for (const value of [null, {}, { publicUrl: 1 }, { publicUrl: "/p/" + token },
    ...["publicToken", "publicTokenHash", "encryptedPublicToken", "keyId", "poll", "organiserId"].map((key) =>
      ({ publicUrl, [key]: "private" })),
    ...[`http://example.com/p/${token}`, `https://user:pass@example.com/p/${token}`,
      `${publicUrl}?token=${token}`, `${publicUrl}#secret`, `${publicUrl}/`, `${publicUrl}\n`,
      "javascript:alert(1)", "https://example.com/p/short", `https://example.com/p/%41${token.slice(1)}`
    ].map((publicUrl) => ({ publicUrl }))]) {
    assert.equal(contracts.ownedPollShareResponseSchema.safeParse(value).success, false);
  }
});

test("legacy recovery and failure envelopes have explicit statuses and no internal fields", () => {
  assert.equal(contracts.OWNED_POLL_SHARE_ERROR_STATUS.LINK_RECOVERY_REQUIRED, 409);
  assert.deepEqual(contracts.OWNED_POLL_SHARE_RESPONSE_HEADERS, {
    "cache-control": "private, no-store", vary: "Authorization, X-Local-Organiser-Id"
  });
  for (const code of Object.keys(contracts.OWNED_POLL_SHARE_ERROR_STATUS)) {
    assert.equal(contracts.ownedPollShareErrorResponseSchema.safeParse({
      error: { code, message: "Safe failure", correlationId: "request-1" }
    }).success, true);
  }
  for (const value of [{ error: { code: "UNKNOWN", message: "Failure" } },
    { error: { code: "constructor", message: "Failure" } },
    { error: { code: "INTERNAL_ERROR", message: " " } },
    { error: { code: "INTERNAL_ERROR", message: "Failure", ciphertext: envelope.ciphertext } },
    { error: { code: "LINK_RECOVERY_REQUIRED", message: "Confirm replacement" }, publicUrl }]) {
    assert.equal(contracts.ownedPollShareErrorResponseSchema.safeParse(value).success, false);
  }
});

test("encrypted fields stay out of existing list, owner and public projections", async () => {
  const poll = {
    id: context.pollId, organiserId: context.organiserId, title: "Dinner", status: "open", version: 2,
    timeZone: "Europe/London", proposedDates: [{ kind: "date", localDate: "2026-10-25" }],
    participantCount: 0, createdAt: "2026-10-10T00:00:00.000Z",
    publicTokenHash: context.publicTokenHash, encryptedPublicToken: envelope
  };
  const summary = toOwnedPollSummary(poll, 0);
  const repository = {
    getPoll: async () => poll,
    getPublicToken: async () => ({ pollId: poll.id, state: "active" }),
    listParticipants: async () => []
  };
  const service = new PollService(repository, { baseUrl: "https://example.com", tokenHashKey: "hash-key" });
  const owner = await service.get(poll.id, poll.organiserId);
  const publicView = await service.getPublic(token);
  for (const response of [summary, owner, publicView]) {
    for (const field of ["publicToken", "publicTokenHash", "encryptedPublicToken", "publicUrl", "keyId", "ciphertext", "authTag", "iv"]) {
      assert.equal(JSON.stringify(response).includes(`"${field}"`), false, field);
    }
  }
  assert.equal(contracts.ownedPollSummarySchema.safeParse({ ...summary, encryptedPublicToken: envelope }).success, false);
  assert.equal(contracts.publicPollResponseSchema.safeParse({ ...publicView, encryptedPublicToken: envelope }).success, false);
});
