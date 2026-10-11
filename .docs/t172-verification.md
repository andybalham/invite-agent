# T-172 / S-062 non-exhaustive regression verification

Date: 11 October 2026. Shared checkout:
`C:\Users\MONTEITH\source\repos\invite-agent`, HEAD
`6ed635cf77c9fdbfc90f7ead672113afdabf46ea` plus the existing uncommitted changes.
No commit was created.

## Scope and prerequisites

T-169, T-170 and T-171 were already `done` when this verification began.
Their existing changes were reviewed and retained: explicit dashboard title/action
selectors, closed-summary `finalDate` expectations, opt-in harness test discovery,
complete output-stream draining, process identity checks, distinct fixture ports,
and bounded atomic manifest replacement on Windows. No `AGENTS.md` was found in
the checkout or its ancestor directories. Repository package scripts, README and
the E2E suite/isolation contracts supplied the verification conventions.

Installed environment: Windows, PowerShell 7.6.6, Node v25.8.1, npm 11.11.0,
Playwright 1.63.0 with Chromium revision 1243, and Docker DynamoDB Local 2.6.1.
The repository's documented CI baseline is Node 24; this record describes the
actual local runtime. Dependencies and Chromium were already installed.

The existing `invite-a-gent-local-dynamodb-1` service was reachable at
`http://127.0.0.1:18000`. Reproduction requires Docker Engine running and the
cached `amazon/dynamodb-local:2.6.1` image; the integration cleanup tests create
their own in-memory containers with no development-data mounts. If the local
database is absent, the documented prerequisite command is
`docker compose -p invite-a-gent-local up -d dynamodb` (not needed in this run).

The active development API/Vite processes (PIDs 17856/12424) use 14000/15173.
The final isolated browser run therefore uses the documented `API_PORT` and
`WEB_PORT` overrides, 14041/15141, selected before startup. The coordinator
checks both ports, creates fresh owned tables, starts its own API/web processes,
and tears them down. No development process was stopped and no occupied-port
failure, stale-process workaround, shared-table opt-in, extra retry, or increased
timeout was used. No E2E/SMOKE context variables were inherited.

Browser, Docker-fixture and local-network operations ran outside the filesystem
sandbox with approval. An initial read-only DynamoDB inventory probe inside the
sandbox returned `connect EACCES 127.0.0.1:18000`; the same probe succeeded outside
it. The sandbox's Chromium lookup also pointed to an absent sandbox-profile
installation; the approved component run used the installed user-profile browser.
These were diagnostic environment restrictions, not failed regression tests.

## Exact regression commands and results

Commands ran from the checkout root in PowerShell. Node stages were serial
between commands; the component and integration commands explicitly serialize
test files. Node test durations below are the runner's reported `duration_ms`.

| Exact command | Result |
| --- | --- |
| `& 'C:\nvm4w-monteith\nodejs\npm.cmd' run check` | Exit 0. Format, lint, TypeScript typecheck/build, production-boundary check, all 191 foundation tests and security check passed. Foundation duration: 6167.1936 ms; 0 failures/cancellations/skips/todos. |
| `node --test --test-concurrency=1 test/component/*.test.mjs` | Exit 0. All 154 tests passed in 46303.595 ms; 0 failures/cancellations/skips/todos. |
| `node --test --test-concurrency=1 test/integration/*.test.mjs` | Exit 0. All 76 tests passed in 387626.5441 ms; 0 failures/cancellations/skips/todos. Includes four nested all-local cleanup cases. Slowest case: full sparse-index traversal, 111122.5525 ms. |
| `$env:API_PORT='14041'; $env:WEB_PORT='15141'; node node_modules/@playwright/test/cli.js test --project=chromium --workers=1 --retries=0 --list --reporter=line` | Exit 0. 74 tests in 22 files; ordinary configuration excludes `@exhaustive`, smoke and intentional cleanup/diagnostic probes. Listing does not provision resources. |
| `$env:API_PORT='14041'; $env:WEB_PORT='15141'; & 'C:\nvm4w-monteith\nodejs\npm.cmd' run test:e2e:fast` | Result to be filled after execution. |

The complete component/integration/foundation selections and the ordinary browser
selection cover the focused improvement gate's stages. Its seven browser files
are `my-polls-improvements`, `my-polls-compact-dates`, `poll-page-share`,
`organiser-navigation`, `navigation-guards`, `my-polls-search`, and
`my-polls-lifecycle`. They are executed within the ordinary gate rather than
duplicated through `test:my-polls:improvements`. The exhaustive matrix/sparse
selection and separate smoke wrapper are outside T-172's required checks.

## Sharing, security and harness evidence

The full component suite includes T-164 draft/Open/Closed owner sharing,
publication focus/status, recovery/clipboard failures, foreign-owner and public
holder isolation, and confirmed rotation. Foundation coverage includes owner
share contracts/regressions, encrypted token recovery, publication secrecy and
public-link rotation. Integration coverage includes organiser authorization,
publication, canonical poll-page sharing and rotation against real DynamoDB.

The integration harness intentionally runs passing, failing, timed-out,
missing-browser, interrupted and partially failed cleanup scenarios. Expected
child-process failures are assertions inside passing Node tests, not ordinary
browser regression failures. The real Docker cleanup test passed in 38520.3097 ms;
the controlled-transport runner test passed in 68679.0824 ms. They prove protected
data preservation, diagnostics retention, process shutdown, table absence and
selected recovery. Their evidence is retained under `.devstack/e2e-runs/`.

## Resource verification

Before integration, a complete paginated DynamoDB `ListTables` returned exactly
`invite-agent-local-app` and `invite-agent-local-audit`. Consistent paginated scans
were sorted by JSON representation and SHA-256 hashed without printing records:

| Protected table | Items | Baseline SHA-256 |
| --- | --- | --- |
| `invite-agent-local-app` | 3 | `50b8d06bb6b382b6773044f05335f170de1031b5830333e5299a67de5dc88834` |
| `invite-agent-local-audit` | 4 | `ba9a92a0550841fcd03012e5b14f73f0e5cd7d273a75236b4a1e998f34ade6dd` |

Final resource evidence will be filled after the browser gate.

## Changes made for T-172

Verification documentation and Kanban evidence/status only. Existing implementation
and test fixes remain uncommitted in the shared workspace.

## Observed browser failures

- `test/e2e/collaborative-availability.spec.ts:138`: the second stale browser
  context did not display Alice's latest availability value within the normal
  5000 ms assertion timeout.
- `test/e2e/my-polls-improvements.spec.ts:45`, desktop and mobile: fixture setup's
  close request returned HTTP 400 where HTTP 200 was expected, before the
  integrated dashboard acceptance assertions ran.

The user instructed this run to stop after the current test command and report.
These failures are recorded without a fix or rerun. They prevent marking T-172
complete; its status stays `in-progress`. No exhaustive browser suite was run.
