# Owner share-link rotation and legacy-poll contract (T-147, T-152)

This contract specifies confirmed replacement for S-056. The current capability remains usable until an organiser explicitly confirms rotation. Local service/repository behavior and My polls interaction are implemented; T-150 and T-151 provide service, component and browser regression coverage. See the [acceptance record](acceptance-use-cases-my-polls.md#s-057-share-link-recovery-and-rotation-t-150t-151) for scope and test commands. Production deployment and live AWS verification are not established by these tests.

## Owner flow and confirmation

Rotation is an authenticated, owner-scoped organiser action on an existing Open or Closed poll. It is not part of share-link GET, page load, retry, copying, opening, or ordinary poll edits. Check verified organiser identity, load the poll, and establish ownership before inspecting recoverable-token state or changing any capability. Return the same non-disclosing owner errors established by the share-link retrieval contract.

The action is labelled **Regenerate link**. Before sending a rotation request, require a deliberate confirmation with this wording (the poll title may be shown separately, but is not interpolated into the warning):

> Regenerate this poll's public link? The current link will stop working immediately. Anyone using it will need the new link. Continue only if you are ready to share the replacement.

The affirmative button is **Regenerate link** and the negative action is **Cancel**. Cancel, Escape, backdrop dismissal, and navigation away perform no request and cause no state change. Do not use a browser-native confirmation whose text cannot be consistently tested. A legacy poll uses the same confirmation: the original URL cannot be recovered, and confirmation creates a new link that replaces the currently working legacy link.

## Atomic transition and invalidation

For an owned Open or Closed poll, generate a fresh public token, its HMAC lookup hash, and a context-bound encrypted token envelope before persistence. In one repository transaction:

1. Require the poll metadata to still have the revision and current token hash observed for this request (or the equivalent conditional state guard).
2. Replace `publicTokenHash` and `encryptedPublicToken` on the poll metadata while preserving lifecycle and unrelated poll fields.
3. Create the new `PUBLIC_TOKEN#<newHash>` capability as active for this poll.
4. Change the old `PUBLIC_TOKEN#<oldHash>` capability from active to revoked, conditional on it still being active and belonging to this poll. Do not remove it: its revoked state is needed to reject cached old URLs explicitly.
5. Write exactly one non-sensitive organiser audit event for the successful transition.

No response may expose the new URL unless the transaction commits. Any conditional failure or transaction cancellation leaves the previous metadata, old active capability, new capability namespace and audit history unchanged. Never perform a sequence of independent writes with a period where both capabilities are valid or neither is valid. The next public request using the old token must fail with the established 410 `LINK_REVOKED` response for both reads and writes; the new URL resolves to the same poll and retains its Open/Closed behavior.

Drafts cannot be rotated; return the established 422 `INVALID_LIFECYCLE` response. A revoked current capability cannot be rotated through this operation; return 410 `LINK_REVOKED`. Missing polls, non-owners and invalid identity follow the owner share-link contract and must not reveal whether a poll is legacy, active, or revoked.

## Audit event

Write one event only when the atomic transition succeeds. Use the existing audit event envelope and actor/target conventions, with event type `public_link.rotated`. Record:

| Field | Required value |
|---|---|
| actor | Verified organiser ID |
| target | Poll ID |
| timestamp | Server-generated UTC timestamp |
| before | `{ lifecycle, publicLinkState }`, where state is `recoverable` or `legacy` |
| after | `{ lifecycle, publicLinkState: "recoverable", previousCapability: "revoked", currentCapability: "active" }` |

The audit event may include the normal event ID and correlation metadata supported by the existing audit model. It must not contain token, URL, token hash, encrypted envelope, key ID, ciphertext, IV, authentication tag, request body, or any before/after snapshot that could carry those values. Do not emit a separate revocation audit event; revocation is part of this single rotation event. Failed, cancelled, retried-after-success, unauthorized, and conflicting requests do not create rotation audit events.

## Retry, idempotency, and concurrency

Rotation is not idempotent across distinct user confirmations: each accepted request creates a fresh capability and invalidates its predecessor. A network retry must not silently rotate again. The client must treat an ambiguous transport result as unknown, then call owner share-link GET to retrieve the committed current URL; GET is read-only and returns the current active URL. If GET reports a generic failure, the user may explicitly confirm another rotation.

Use the observed revision/hash and conditional transaction writes to serialize concurrent requests. When two requests race from the same current link, at most one may commit. The loser returns a stable 409 `LINK_ROTATION_CONFLICT` (safe fixed message, no storage details) and must not retry automatically, emit an audit event, or return its uncommitted candidate URL. A later explicit confirmation can rotate the winner's link. A retry arriving after another rotation must not revoke the newer capability based on stale observations.

The transport accepts no caller-provided token, hash, envelope, replacement URL, owner ID, or key ID. Generate all capability material server-side. Return only the URL-only success shape `{ "publicUrl": "<trusted-origin>/p/<token>" }`, with the same private no-store and Vary headers as owner share-link retrieval. Keep secrets out of logs and errors.

## Legacy polls and recovery failures

An Open/Closed hash-only record with no `encryptedPublicToken` property is legacy. Existing public links continue working unchanged until the owner completes the explicit confirmation above. Owner GET returns 409 `LINK_RECOVERY_REQUIRED` with the fixed actionable message:

> The existing link cannot be recovered. Replacing it requires confirmation and will stop the old link working.

The response contains no poll token, URL, hash, envelope, key identifier, or storage diagnostic. Never infer a token from its hash, expose a recovery flag in public/list responses, or automatically replace the capability. Confirmed rotation uses the same atomic transition and audit event as a recoverable link; its audit `before.publicLinkState` is `legacy`.

Only a truly absent envelope property qualifies as legacy. A present-but-null/malformed envelope, unknown encryption key, authentication failure, HMAC mismatch, inconsistent/missing capability, or infrastructure failure is an internal error, not a legacy case. Fail closed with generic 500 `INTERNAL_ERROR`; do not rotate, revoke, or write audit state. Cross-owner requests fail before this distinction is evaluated.

## Acceptance checks

- No rotation occurs before explicit confirmation; all cancel paths leave storage and audit snapshots byte-for-byte unchanged.
- Successful rotation changes metadata hash/envelope, creates the new active capability, revokes the former capability, and writes one safe audit event atomically.
- Old-token public reads and writes fail as revoked after commit; the replacement works for the same poll.
- Draft, revoked, missing, unauthorized, and conflicting paths return the specified safe outcome and do not partially mutate state.
- Concurrent stale rotations produce at most one commit; network ambiguity is resolved by read-only GET, not implicit repeat mutation.
- Hash-only legacy polls retain their current public link until confirmation, report only the fixed non-sensitive recovery message to the owner, and rotate through the same atomic/audit path after confirmation.
- Present-but-invalid recovery material is never treated as legacy and never causes automatic replacement.
