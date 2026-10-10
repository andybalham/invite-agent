import assert from "node:assert/strict";
import test from "node:test";
import { PollService } from "../../backend/dist/application/poll-service.js";
import { DynamoPollRepository } from "../../backend/dist/data/dynamodb-poll-repository.js";
import { createSharedHttpHandler } from "../../backend/dist/http/shared-handler.js";
import { createPublicToken, hashPublicToken } from "../../backend/dist/security/index.js";
import { testPublicTokenCipher } from "../support/public-token-encryption.mjs";

const hashKey = "rotation-test-hmac";
const cipher = testPublicTokenCipher();
const oldToken = createPublicToken();
const oldHash = hashPublicToken(oldToken, hashKey);
const poll = { id: "poll-1", organiserId: "owner-1", title: "Dinner", status: "open", version: 2,
  participantCount: 0, timeZone: "Europe/London", createdAt: "2026-10-10T00:00:00.000Z",
  proposedDates: [{ kind: "date", localDate: "2026-11-10" }], publicTokenHash: oldHash,
  encryptedPublicToken: cipher.encrypt(oldToken, { pollId: "poll-1", organiserId: "owner-1", publicTokenHash: oldHash }) };

function serviceFor(record = poll, capability = { pollId: poll.id, state: "active" }, rotate = async () => {}) {
  const writes = [];
  const repository = {
    getPoll: async () => structuredClone(record),
    getPublicToken: async () => capability,
    rotatePublicToken: async (...args) => { writes.push(args); await rotate(...args); }
  };
  return { service: new PollService(repository, { baseUrl: "https://example.com", tokenHashKey: hashKey,
    publicTokenCipher: cipher }), writes, repository };
}

test("rotation changes only link metadata, records one safe event, and returns the committed URL", async () => {
  const { service, writes } = serviceFor();
  const result = await service.rotateOwnedShareLink(poll.id, poll.organiserId);
  assert.deepEqual(Object.keys(result), ["publicUrl"]);
  const replacement = result.publicUrl.split("/").at(-1);
  assert.notEqual(replacement, oldToken);
  assert.equal(writes.length, 1);
  const [before, after, event] = writes[0];
  assert.deepEqual(before, poll);
  assert.deepEqual({ ...after, version: before.version, publicTokenHash: before.publicTokenHash,
    encryptedPublicToken: before.encryptedPublicToken }, before);
  assert.equal(after.publicTokenHash, hashPublicToken(replacement, hashKey));
  assert.equal(cipher.decrypt(after.encryptedPublicToken, {
    pollId: poll.id, organiserId: poll.organiserId, publicTokenHash: after.publicTokenHash
  }), replacement);
  assert.equal(event.action, "public_link.rotated");
  assert.equal(event.actorId, poll.organiserId);
  assert.equal(event.revision, after.version);
  assert.deepEqual(event.before, { lifecycle: "open", publicLinkState: "recoverable" });
  assert.deepEqual(event.after, { lifecycle: "open", publicLinkState: "recoverable",
    previousCapability: "revoked", currentCapability: "active" });
  for (const secret of [oldToken, replacement, oldHash, after.publicTokenHash, "encryptedPublicToken", "ciphertext"]) {
    assert.equal(JSON.stringify(event).includes(secret), false);
  }
});

test("legacy links rotate only on explicit call; malformed recovery and absent capabilities fail closed", async () => {
  const { encryptedPublicToken: _envelope, ...legacy } = poll;
  const old = serviceFor(legacy);
  await assert.rejects(old.service.getOwnedShareLink(poll.id, poll.organiserId), { code: "LINK_RECOVERY_REQUIRED" });
  assert.deepEqual(old.writes, []);
  await old.service.rotateOwnedShareLink(poll.id, poll.organiserId);
  assert.deepEqual(old.writes[0][2].before, { lifecycle: "open", publicLinkState: "legacy" });
  for (const invalid of [{ ...poll, encryptedPublicToken: null },
    { ...poll, encryptedPublicToken: { ...poll.encryptedPublicToken, keyId: "missing" } }]) {
    const fixture = serviceFor(invalid);
    await assert.rejects(fixture.service.rotateOwnedShareLink(poll.id, poll.organiserId), { code: "INTERNAL_ERROR" });
    assert.deepEqual(fixture.writes, []);
  }
  const missing = serviceFor(legacy, null);
  await assert.rejects(missing.service.rotateOwnedShareLink(poll.id, poll.organiserId), { code: "INTERNAL_ERROR" });
  assert.deepEqual(missing.writes, []);
});

test("owner, lifecycle, revoked, and validation failures do not rotate", async () => {
  for (const [record, capability, owner, request, code] of [
    [null, { pollId: poll.id, state: "active" }, poll.organiserId, {}, "NOT_FOUND"],
    [poll, { pollId: poll.id, state: "active" }, "other", {}, "FORBIDDEN"],
    [{ ...poll, status: "draft" }, { pollId: poll.id, state: "active" }, poll.organiserId, {}, "INVALID_LIFECYCLE"],
    [poll, { pollId: poll.id, state: "revoked" }, poll.organiserId, {}, "LINK_REVOKED"],
    [poll, { pollId: poll.id, state: "active" }, poll.organiserId, { body: { token: oldToken } }, "VALIDATION_ERROR"]
  ]) {
    const fixture = serviceFor(record, capability);
    await assert.rejects(fixture.service.rotateOwnedShareLink(poll.id, owner, request), { code });
    assert.deepEqual(fixture.writes, []);
  }
});

test("transaction cancellation returns a fixed conflict and never returns the candidate URL", async () => {
  const fixture = serviceFor(poll, { pollId: poll.id, state: "active" }, async () => {
    const error = new Error("private transaction detail");
    error.name = "TransactionCanceledException";
    throw error;
  });
  await assert.rejects(fixture.service.rotateOwnedShareLink(poll.id, poll.organiserId),
    { code: "LINK_ROTATION_CONFLICT", message: "The poll link changed. Refresh and try again" });
});

test("DynamoDB rotation uses one guarded transaction for metadata, new and old capabilities, and audit", async () => {
  const commands = [];
  const repository = new DynamoPollRepository({ send: async (command) => { commands.push(command); return {}; } },
    { appTableName: "app", auditTableName: "audit" });
  const { service } = serviceFor();
  const result = await service.rotateOwnedShareLink(poll.id, poll.organiserId);
  const replacement = result.publicUrl.split("/").at(-1);
  const nextHash = hashPublicToken(replacement, hashKey);
  const after = { ...poll, version: 3, publicTokenHash: nextHash,
    encryptedPublicToken: cipher.encrypt(replacement, { pollId: poll.id, organiserId: poll.organiserId, publicTokenHash: nextHash }) };
  await repository.rotatePublicToken(poll, after, { pollId: poll.id, id: "event-1", action: "public_link.rotated",
    actorId: poll.organiserId, actorCategory: "organiser", occurredAt: new Date().toISOString(), revision: 3,
    entityType: "poll", entityId: poll.id, before: { lifecycle: "open", publicLinkState: "recoverable" },
    after: { lifecycle: "open", publicLinkState: "recoverable", previousCapability: "revoked", currentCapability: "active" } });
  assert.equal(commands.length, 1);
  const [metadata, next, previous, audit] = commands[0].input.TransactItems;
  assert.match(metadata.Put.ConditionExpression, /#version = :previousVersion.*#document = :observedDocument/);
  assert.equal(metadata.Put.ExpressionAttributeValues[":observedDocument"].S, JSON.stringify(poll));
  assert.equal(JSON.parse(metadata.Put.Item.document.S).publicTokenHash, nextHash);
  assert.equal(next.Put.Item.PK.S, `PUBLIC_TOKEN#${nextHash}`);
  assert.equal(next.Put.Item.state.S, "active");
  assert.equal(next.Put.Item.encryptedPublicToken, undefined);
  assert.match(next.Put.ConditionExpression, /attribute_not_exists/);
  assert.equal(previous.Update.Key.PK.S, `PUBLIC_TOKEN#${oldHash}`);
  assert.equal(previous.Update.ExpressionAttributeValues[":active"].S, "active");
  assert.equal(previous.Update.ExpressionAttributeValues[":revoked"].S, "revoked");
  assert.equal(previous.Update.ExpressionAttributeValues[":pollId"].S, poll.id);
  assert.match(previous.Update.ConditionExpression, /pollId = :pollId/);
  assert.equal(audit.Put.Item.action.S, "public_link.rotated");
  assert.equal(JSON.stringify(audit).includes(nextHash), false);
});

test("POST rotation route requires organiser authentication and sends private no-store responses", async () => {
  const { service, writes, repository } = serviceFor();
  const handler = createSharedHttpHandler({ authenticate: (headers) => {
    if (!headers.authorization) throw new Error("unauthenticated");
    return poll.organiserId;
  }, polls: service, repository });
  const path = `/api/organiser/polls/${poll.id}/share-link/rotate`;
  const denied = await handler.handle({ method: "POST", path, headers: {} });
  assert.equal(denied.status, 401);
  assert.equal(denied.headers["cache-control"], "private, no-store");
  const success = await handler.handle({ method: "POST", path, headers: { authorization: "Bearer verified" } });
  assert.equal(success.status, 200);
  assert.deepEqual(Object.keys(success.body), ["publicUrl"]);
  assert.equal(success.headers.vary, "Authorization, X-Local-Organiser-Id");
  assert.equal(writes.length, 1);
});
