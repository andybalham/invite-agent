# T-140 verification record

Verification date: 10 October 2026. The checks below were run against the current
working tree containing the T-138/T-139 changes. No commit was created.

## Suite results

| Command | Result | Evidence |
| --- | --- | --- |
| `npm run test:e2e:fast` | PASS: 53/53, about 2.0 minutes | Run `20261010t092557581z-7c6c9b2c2d4b4e69b0024dd99bb8f93a`; both owned tables deleted; no diagnostic failures |
| `API_PORT=14041 WEB_PORT=15141 npm run test:e2e:fast` | PASS: 53/53, about 1.9 minutes | Run `20261010t092903746z-fde2121ad0714ed397ae632906df4b84`; manifest recorded the overridden ports; both owned tables deleted |
| `npm run test:e2e:smoke` | PASS: SM-01–SM-11, 1/1, 34.0 seconds | Smoke run `20261010t093206703z-c18ab3c40e644baab28c0e977c85a2ff`; app/audit tables both `deleted`; no cleanup or diagnostic failures |
| `npm run test:e2e:discovery` | PASS: 14 pure, 13 frontend, 7 HTTP/persistence, 19 browser tests | Browser run `20261010t093530124z-f3563fe88527451ea8b90e7a526bc5a8`; owned tables deleted |
| `npm run test:e2e:exhaustive` | PASS: 2/2, about 2.4 minutes | Run `20261010t093703811z-73b761d6ca5b4963bd43687c49a9a72e`; owned tables deleted |
| `npm run test:foundation` | 147/147 foundation tests passed; browser gate 52/53 passed | One timing-sensitive failure in `collaborative-availability.spec.ts` where the second stale context did not observe Alice's saved value within 5 seconds. Diagnostics were retained and cleanup completed. |
| Targeted collaboration rerun | PASS: 1/1, 4.8 seconds | Run `20261010t094537116z-13a467768b884e80b0839fcfb34c42c2`; both owned tables deleted; no diagnostic failures |

The initial fast attempt was blocked before table creation by sandbox `EACCES`
access to `127.0.0.1:18000`. Its manifest and failure diagnostics were retained;
an exact-manifest preview and recovery confirmed both names absent and cleared the
recovery-required state. This is an execution-environment limitation, not an
application result.

## Isolation and no-cruft evidence

The protected development tables were scanned consistently before the remaining
suites and after all runs:

| Table | Before count / SHA-256 | After count / SHA-256 |
| --- | --- | --- |
| `invite-agent-local-app` | 968 / `18847f8978320ac3281a0ba104297ac0ce9309a269832daf20d3be715ec378b6` | 968 / `18847f8978320ac3281a0ba104297ac0ce9309a269832daf20d3be715ec378b6` |
| `invite-agent-local-audit` | 1,106 / `c10f1d17e90763f1ce2314ff022103d3e1826b29cf32f849d898846e2a4cc6e0` | 1,106 / `c10f1d17e90763f1ce2314ff022103d3e1826b29cf32f849d898846e2a4cc6e0` |

The final DynamoDB Local table inventory contained only those two protected tables.
All current T-140 fast/discovery/exhaustive manifests report `remainingTables: []`
and `remainingServices: []`; the smoke manifest reports both owned tables as
`deleted`. Reports, traces, screenshots, videos, manifests, summaries, service
logs, and cleanup logs remain under `.devstack/e2e-runs/` or `.devstack/smoke-runs/`.

## Limitations

- The full foundation browser gate had one non-reproduced timing failure; the exact
  test passed in a fresh isolated rerun. The requested fast, smoke, discovery, and
  exhaustive suite commands all passed.
- Runs used local DynamoDB Local and Chromium. No production AWS/Cognito or remote
  browser acceptance was attempted.
- The first sandboxed invocation could not access the local Docker endpoint; the
  successful acceptance runs used approved local-service access.
