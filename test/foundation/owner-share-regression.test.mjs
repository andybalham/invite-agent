import assert from "node:assert/strict";
import test from "node:test";
import { PollService } from "../../backend/dist/application/poll-service.js";
import { OWNED_POLL_SHARE_ERROR_MESSAGES } from "../../backend/dist/application/errors.js";
import { createSharedHttpHandler } from "../../backend/dist/http/shared-handler.js";
import { createOrganiserLambdaHandler, createPublicLambdaHandler } from "../../backend/dist/functions/http-api.js";
import { createPublicToken, hashPublicToken } from "../../backend/dist/security/index.js";
import { OWNED_POLL_SHARE_RESPONSE_HEADERS } from "../../packages/contracts/dist/index.js";
import { testPublicTokenCipher } from "../support/public-token-encryption.mjs";

const hashKey = "owner-share-regression-hmac";
const token = createPublicToken();
const cipher = testPublicTokenCipher();
const poll = { id: "poll-1", organiserId: "owner-1", title: "Dinner", status: "open", version: 2,
  participantCount: 0, timeZone: "Europe/London", createdAt: "2026-10-10T00:00:00.000Z",
  proposedDates: [{ kind: "date", localDate: "2026-11-10" }], publicTokenHash: hashPublicToken(token, hashKey) };
poll.encryptedPublicToken = cipher.encrypt(token, {
  pollId: poll.id, organiserId: poll.organiserId, publicTokenHash: poll.publicTokenHash
});
const publicUrl = `https://example.com/p/${token}`;
const path = `/api/organiser/polls/${poll.id}/share-link`;

function fixture(record = poll, capability = { pollId: poll.id, state: "active" }, tokenCipher = cipher) {
  const calls = { poll: 0, capability: 0, decrypt: 0, encrypt: 0, writes: [] };
  const repository = {
    async getPoll() { calls.poll++; return structuredClone(record); },
    async getPublicToken() { calls.capability++; return structuredClone(capability); },
    async rotatePublicToken(...args) { calls.writes.push(args); }
  };
  const service = new PollService(repository, { baseUrl: "https://example.com", tokenHashKey: hashKey,
    publicTokenCipher: {
      decrypt(...args) { calls.decrypt++; return tokenCipher.decrypt(...args); },
      encrypt(...args) { calls.encrypt++; return tokenCipher.encrypt(...args); }
    } });
  const http = createSharedHttpHandler({ polls: service, repository, authenticate: (headers) => {
    if (!headers.identity) throw new Error("private authentication diagnostic");
    return headers.identity;
  } });
  return { service, repository, calls, http };
}

function safeError(result, status, code) {
  assert.equal(result.status, status);
  assert.deepEqual(result.headers, OWNED_POLL_SHARE_RESPONSE_HEADERS);
  assert.deepEqual(result.body, { error: { code, message: OWNED_POLL_SHARE_ERROR_MESSAGES[code] } });
  for (const secret of [token, publicUrl, poll.publicTokenHash, ...Object.values(poll.encryptedPublicToken).filter((v) => typeof v === "string")]) {
    assert.equal(JSON.stringify(result.body).includes(secret), false);
  }
}

test("T-150 owner recovery of Open and Closed links is repeatable and does not write or encrypt", async () => {
  for (const status of ["open", "closed"]) {
    const record = { ...poll, status };
    const before = structuredClone(record);
    const { service, http, calls } = fixture(record);
    assert.deepEqual(await service.getOwnedShareLink(poll.id, poll.organiserId), { publicUrl });
    for (let retry = 0; retry < 2; retry++) {
      const result = await http.handle({ method: "GET", path, headers: { identity: poll.organiserId,
        host: "attacker.example", "x-forwarded-host": "attacker.example" } });
      assert.equal(result.status, 200);
      assert.deepEqual(result.headers, OWNED_POLL_SHARE_RESPONSE_HEADERS);
      assert.deepEqual(result.body, { publicUrl });
    }
    assert.deepEqual(record, before);
    assert.equal(calls.encrypt, 0);
    assert.deepEqual(calls.writes, []);
  }
});

test("T-150 identity and ownership precede storage inspection, lifecycle and request validation", async () => {
  const { encryptedPublicToken: _envelope, ...legacy } = poll;
  for (const record of [poll, legacy, { ...poll, status: "draft" }, { ...poll, encryptedPublicToken: null }]) {
    for (const method of ["GET", "POST"]) {
      const route = method === "GET" ? path : `${path}/rotate`;
      const { http, calls } = fixture(record, { pollId: poll.id, state: "revoked" });
      safeError(await http.handle({ method, path: route, headers: { authorization: `Bearer ${token}` },
        body: { ownerId: poll.organiserId }, rawQuery: `token=${token}` }), 401, "UNAUTHENTICATED");
      assert.equal(calls.poll, 0);
      safeError(await http.handle({ method, path: route, headers: { identity: "other-owner" },
        body: { ownerId: poll.organiserId }, rawQuery: `token=${token}` }), 403, "FORBIDDEN");
      assert.equal(calls.capability, 0);
      assert.equal(calls.decrypt, 0);
      assert.equal(calls.encrypt, 0);
      assert.deepEqual(calls.writes, []);
    }
  }
  for (const operation of ["getOwnedShareLink", "rotateOwnedShareLink"]) {
    const { service, calls } = fixture();
    await assert.rejects(service[operation](poll.id, " "), { code: "UNAUTHENTICATED" });
    assert.equal(calls.poll, 0);
  }
});

test("T-150 recovery and rotation expose exact safe errors for missing, draft, legacy and revoked links", async () => {
  const { encryptedPublicToken: _envelope, ...legacy } = poll;
  for (const [record, capability, status, code] of [
    [null, undefined, 404, "NOT_FOUND"],
    [{ ...poll, status: "draft" }, undefined, 422, "INVALID_LIFECYCLE"],
    [legacy, { pollId: poll.id, state: "active" }, 409, "LINK_RECOVERY_REQUIRED"],
    [poll, { pollId: poll.id, state: "revoked" }, 410, "LINK_REVOKED"],
    [legacy, { pollId: poll.id, state: "revoked" }, 410, "LINK_REVOKED"]
  ]) {
    const f = fixture(record, capability);
    if (!record) f.repository.getPoll = async () => undefined;
    safeError(await f.http.handle({ method: "GET", path, headers: { identity: poll.organiserId } }), status, code);
    assert.deepEqual(f.calls.writes, []);
    if (code !== "LINK_RECOVERY_REQUIRED") {
      safeError(await f.http.handle({ method: "POST", path: `${path}/rotate`, headers: { identity: poll.organiserId } }), status, code);
      assert.deepEqual(f.calls.writes, []);
    }
  }
});

test("T-150 corrupted encrypted tokens and inconsistent capabilities fail closed through both routes", async () => {
  const tampered = { ...poll.encryptedPublicToken };
  const bytes = Buffer.from(tampered.authTag, "base64url");
  bytes[0] ^= 1;
  tampered.authTag = bytes.toString("base64url");
  const foreign = cipher.encrypt(token, { pollId: "other-poll", organiserId: poll.organiserId, publicTokenHash: poll.publicTokenHash });
  const wrongTokenCipher = { decrypt: () => createPublicToken(), encrypt: cipher.encrypt.bind(cipher) };
  const diagnosticCipher = { decrypt() { throw new Error(`${publicUrl} ${poll.publicTokenHash}`); } };
  for (const [record, capability, tokenCipher] of [
    ...[null, {}, tampered, foreign, { ...poll.encryptedPublicToken, keyId: "missing-key" }]
      .map((encryptedPublicToken) => [{ ...poll, encryptedPublicToken }]),
    [{ ...poll, publicTokenHash: undefined }],
    [poll, null], [poll, { pollId: "other-poll", state: "active" }],
    [poll, { pollId: poll.id, state: "unknown" }],
    [poll, undefined, wrongTokenCipher], [poll, undefined, diagnosticCipher]
  ]) {
    const { http, calls } = fixture(record, capability, tokenCipher);
    for (const method of ["GET", "POST"]) {
      safeError(await http.handle({ method, path: method === "GET" ? path : `${path}/rotate`,
        headers: { identity: poll.organiserId } }), 500, "INTERNAL_ERROR");
    }
    assert.equal(calls.encrypt, 0);
    assert.deepEqual(calls.writes, []);
  }
});

test("T-150 infrastructure and transaction errors reveal no candidate URL and do not retry", async () => {
  for (const failure of ["getPoll", "getPublicToken", "rotatePublicToken"]) {
    for (const name of ["Error", "TransactionCanceledException"]) {
      const f = fixture();
      let attempts = 0;
      f.repository[failure] = async () => { attempts++; throw Object.assign(new Error(publicUrl), { name }); };
      const conflict = failure === "rotatePublicToken" && name === "TransactionCanceledException";
      safeError(await f.http.handle({ method: "POST", path: `${path}/rotate`, headers: { identity: poll.organiserId } }),
        conflict ? 409 : 500, conflict ? "LINK_ROTATION_CONFLICT" : "INTERNAL_ERROR");
      assert.equal(attempts, 1);
      if (failure !== "rotatePublicToken") {
        safeError(await f.http.handle({ method: "GET", path, headers: { identity: poll.organiserId } }), 500, "INTERNAL_ERROR");
        assert.equal(attempts, 2);
      }
    }
  }
  const failedEncryption = fixture(poll, undefined, {
    decrypt: cipher.decrypt.bind(cipher),
    encrypt() { throw new Error(publicUrl); }
  });
  safeError(await failedEncryption.http.handle({ method: "POST", path: `${path}/rotate`,
    headers: { identity: poll.organiserId } }), 500, "INTERNAL_ERROR");
  assert.equal(failedEncryption.calls.encrypt, 1);
  assert.deepEqual(failedEncryption.calls.writes, []);
});

test("T-150 Lambda uses verified JWT owner and isolates recovery from the public adapter", async () => {
  for (const method of ["GET", "POST"]) {
    const f = fixture();
    const organiser = createOrganiserLambdaHandler({ polls: f.service, repository: f.repository });
    const publicHandler = createPublicLambdaHandler({ polls: f.service, repository: f.repository });
    const event = { rawPath: method === "GET" ? path : `${path}/rotate`,
      headers: { "x-local-organiser-id": poll.organiserId, authorization: `Bearer ${token}` },
      requestContext: { http: { method } } };
    const check = (response, status, code) => safeError({ status: response.statusCode,
      headers: Object.fromEntries(Object.entries(response.headers).filter(([key]) => key !== "content-type")),
      body: JSON.parse(response.body) }, status, code);
    check(await organiser(event), 401, "UNAUTHENTICATED");
    assert.equal(f.calls.poll, 0);
    check(await organiser({ ...event, body: "malformed-json", requestContext: { http: { method },
      authorizer: { jwt: { claims: { sub: "other-owner" } } } } }), 403, "FORBIDDEN");
    assert.equal(f.calls.decrypt, 0);
    check(await organiser({ ...event, body: "malformed-json", requestContext: { http: { method },
      authorizer: { jwt: { claims: { sub: poll.organiserId } } } } }), 400, "VALIDATION_ERROR");
    const reads = f.calls.poll;
    assert.equal((await publicHandler(event)).statusCode, 404);
    assert.equal(f.calls.poll, reads);
    assert.deepEqual(f.calls.writes, []);
    const success = await organiser({ ...event, headers: { "x-local-organiser-id": "other-owner", host: "attacker.example" },
      requestContext: { http: { method }, authorizer: { jwt: { claims: { sub: poll.organiserId } } } } });
    assert.equal(success.statusCode, 200);
    assert.deepEqual(Object.keys(JSON.parse(success.body)), ["publicUrl"]);
    assert.ok(JSON.parse(success.body).publicUrl.startsWith("https://example.com/p/"));
    for (const [key, value] of Object.entries(OWNED_POLL_SHARE_RESPONSE_HEADERS)) assert.equal(success.headers[key], value);
  }
});
