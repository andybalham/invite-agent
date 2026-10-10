# Owner share-link recovery contract (T-141)

This is the implementation contract for S-054. T-141 supplies internal types, envelope/context/configuration validation, share response schemas, and regression tests. Encryption execution, publication transactions and composition wiring are T-142; the owner GET and transport error mapping are T-143. No recovery endpoint or production resources are delivered by T-141.

## Persisted representation and encryption boundary

The existing `PollRecord.publicTokenHash` remains the HMAC-SHA256 capability lookup value. Add optional `PollRecord.encryptedPublicToken` inside the JSON `document` on `POLL#<id>` / `METADATA`. Do not add plaintext, a URL, a GSI projection, or recoverable material to `PUBLIC_TOKEN#<hash>` / `CAPABILITY`. Drafts have neither token field; older Open/Closed records may have only the hash.

The envelope is internal to the backend, defined in `backend/src/security/public-token-storage.ts`:

| Field | Required value |
|---|---|
| `version` | Integer `1`; reject unknown versions |
| `algorithm` | Literal `aes-256-gcm`; reject alternatives |
| `keyId` | Key-ring identifier, 1–64 ASCII letters, digits, `_` or `-` |
| `iv` | Canonical unpadded Base64URL of 12 random bytes; fresh for every encryption with a given key |
| `ciphertext` | Canonical unpadded Base64URL of 32 bytes (the existing 32-character token encrypted as UTF-8) |
| `authTag` | Canonical unpadded Base64URL of 16 bytes |

Reject missing or additional envelope fields and noncanonical encodings. Shape validation is not authentication. The application cipher implements `PublicTokenCipher`, using `createCipheriv`/`createDecipheriv`, a 32-byte secret key and explicit `authTagLength: 16`. It generates IVs with `randomBytes(12)`, authenticates before returning plaintext, and validates the decrypted value with `isPublicToken`. Never return partial plaintext from `decipher.update` before `decipher.final` succeeds. These authenticated-encryption API rules follow the [Node.js crypto API](https://nodejs.org/api/crypto.html#class-decipher).

Authenticated additional data is the exact UTF-8 encoding produced by `encodePublicTokenEncryptionContext`:

```text
JSON.stringify(["invite-agent/public-token", 1, pollId, organiserId, publicTokenHash])
```

This binds the envelope to its owner, poll and capability, without ambiguous concatenation. It deliberately excludes mutable poll revision/lifecycle so edits, closing and reopening preserve recovery. Ownership comes from a strongly read poll record, not a request field. After decryption, recompute the token HMAC and match the stored hash; strongly read the capability and require `active` with the same poll ID before returning the URL. Unknown keys, invalid envelopes, authentication failures, hash mismatches, missing capabilities and mismatched poll IDs fail closed. Public validation still uses only the hash/capability and does not require decryption keys.

Encryption is an application concern behind the service boundary. The repository persists an opaque envelope, never decrypts it, and preserves it during ordinary metadata writes. Publication must encrypt before attempting a transaction. T-142 must atomically persist the Open metadata/hash/envelope, active capability and non-sensitive publication audit event. If configuration, encryption or transaction validation fails, retain the Draft and return no URL. No hash-only fallback is permitted for newly published polls after wiring this feature.

## Key and adapter configuration

`readPublicTokenEncryptionConfig(environment, tokenHashKey)` defines a common validated input for local and production composition:

| Variable | Contract |
|---|---|
| `PUBLIC_TOKEN_ENCRYPTION_ACTIVE_KEY_ID` | Identifier present in the ring; used for all new encryptions |
| `PUBLIC_TOKEN_ENCRYPTION_KEYS` | JSON object mapping key IDs to independently generated 32-byte keys encoded as canonical unpadded Base64URL |
| `PUBLIC_TOKEN_HASH_KEY` | Existing HMAC key; independent of encryption keys |

The parser returns secret `KeyObject`s and a read-only key map. Missing/invalid configuration, invalid IDs, malformed keys, absent active keys, duplicate key material, and reuse of the HMAC key produce only `Invalid public token encryption configuration`; never include the rejected value, parser error, key bytes or environment dump. This validator has no local, test, production or ephemeral defaults. Call it once at startup when composing recovery-enabled organiser services. Do not accept client-supplied key IDs or key material.

T-142 must require a persistent private local ring through shell variables or an ignored private config. Test harnesses may explicitly provision isolated random rings for the lifetime of their disposable tables; restarting against those tables must preserve the ring. Do not generate a new startup key when retaining developer data. The existing scripts do not load `.env.local` automatically. Never use `VITE_*`, browser bundles, checked-in examples, logs or test evidence to carry real keys.

Production organiser composition must load the same validated ring from a private secret managed outside source control (target: AWS Secrets Manager, with the secret identifier as configuration and least-privilege organiser access). Keep the public function's hash-validation path free of decryption-key permissions. Secrets retrieval, CDK/IAM and deployed startup checks remain future production work; the existing Lambda factories only accept injected service/repository dependencies.

To rotate encryption keys, retain the old entries, add a new independently generated key, then switch the active ID. Existing envelopes decrypt by their recorded ID; new writes use the active ID. Re-encryption is a separate controlled operation and does not change a public capability. Remove an old key only after all live envelopes and retained backups no longer require it. Loss of an old key is an operational failure, not proof of a legacy record. Do not silently issue a replacement link. Rotating the HMAC key independently needs a separate capability migration; changing it breaks current lookup and is outside this task.

## Owner-only retrieval contract

Planned route: `GET /api/organiser/polls/{pollId}/share-link`. No body or query parameters. Authenticate through the existing verified organiser context (guarded local adapter or API Gateway JWT authorizer), load the poll strongly, then check ownership before inspecting lifecycle, recovery storage or capabilities. Possession of a public token never grants retrieval access. Derive the public origin from trusted `PUBLIC_BASE_URL`, never request `Host`/forwarded headers. Require HTTPS in production; loopback HTTP is permitted locally. The configured value is an origin, with an optional trailing slash, without credentials, path, query or fragment.

On success, return status 200 with exactly:

```json
{ "publicUrl": "https://invite-agent.example/p/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }
```

`OwnedPollShareResponse` / `ownedPollShareResponseSchema` validate this URL-only shape. GET works for both Open and Closed polls without changing the token, hash, envelope, lifecycle, revision, participants or audit history. Read retries return the current active URL; they never generate or rotate a capability. There is no raw `publicToken` field. Publication continues to use its existing `{ poll, publicUrl }` response; this new GET has its own contract.

| Outcome (evaluate in this order) | Status/code | Safe response meaning |
|---|---|---|
| Missing/invalid verified identity | 401 `UNAUTHENTICATED` | Sign-in required; no storage inspection |
| Missing poll | 404 `NOT_FOUND` | Poll not found |
| Different organiser | 403 `FORBIDDEN` | Ownership rejected; do not disclose lifecycle/recoverability |
| Body/query supplied after authentication/ownership | 400 `VALIDATION_ERROR` | Share requests accept no body or query |
| Draft | 422 `INVALID_LIFECYCLE` | Publish the poll first |
| Owned Open/Closed, hash present, envelope property absent | 409 `LINK_RECOVERY_REQUIRED` | Original link cannot be recovered; explicit confirmed replacement is needed |
| Current capability explicitly revoked | 410 `LINK_REVOKED` | Current link is inactive; no URL |
| Malformed/present-but-null envelope, absent hash, unknown key, failed authentication/HMAC, inconsistent capability or infrastructure failure | 500 `INTERNAL_ERROR` | Generic failure; no cryptographic diagnosis or automatic replacement |

Errors use `{ error: { code, message, correlationId? } }`, validated by `ownedPollShareErrorResponseSchema`. The dedicated status mapping is `OWNED_POLL_SHARE_ERROR_STATUS`; T-143 must integrate recovery errors without changing existing error statuses. Fixed safe messages must exclude all hashes, envelopes, key IDs, tokens, URLs and exception contents. Detailed operational diagnostics may use a fixed failure category and correlation ID only. The schema rejects extra fields but cannot detect secrets embedded in free-text messages; the service must supply safe messages.

Every success and failure for this route carries `OWNED_POLL_SHARE_RESPONSE_HEADERS`: `Cache-Control: private, no-store` and `Vary: Authorization, X-Local-Organiser-Id`. T-143 must preserve them in the shared handler, local JSON/error adapter and Lambda parsing/errors, including failures before the service runs. Use no ETag, conditional 304 or intermediary cache; the browser must request with `cache: "no-store"`. API Gateway/CloudFront caching must be disabled in production. Do not log response bodies or capability URLs. Current Lambda responses already default to no-store, while the local adapter currently relies on handler headers; this is not evidence that the new route is implemented.

## Compatibility and non-disclosure

- Hash-only legacy links remain usable through existing public routes. GET returns the actionable state only to the owner and never guesses/reconstructs a token from a hash. T-147/T-148 specify and implement explicit confirmed replacement, atomic capability revocation and audit behavior.
- Draft, owner detail, public poll, My polls summaries/pages, audit before/after values, undo previews and events must exclude the token, hash, envelope and URL. Only authorised publication/retrieval/confirmed replacement responses may carry a URL. Never spread `PollRecord` into a DTO or audit snapshot. Existing explicit detail/summary projections already satisfy this boundary and have regression coverage with the new field.
- Ordinary edits, close/reopen and undo preserve encrypted storage; recovery GET produces no audit mutation. Audits record lifecycle or replacement facts, never cryptographic material. T-142/T-150 cover transactional/audit persistence and secrecy.
- Cross-owner requests must fail before decryption or the legacy branch. Public responses and list responses must not acquire a recovery flag that reveals storage state. A configured secret failure must not masquerade as a legacy record or a successful empty result.
- T-141 tests verify schemas, field validation, context binding, explicit key configuration and existing projections. Cipher authentication/tamper tests, transaction failure/concurrency tests and route/header/owner-isolation tests belong to T-142/T-143/T-150. This document defines those obligations without claiming their execution.
