---
id: T-030
type: task
title: Implement transparent contention retry and last-commit persistence
parent: S-014
status: done
dependsOn: [T-029]
estimate: 1.5
tags: [backend, green, implementation, S-014]
archived: false
created: 2026-09-27T18:08:41.271Z
updated: 2026-09-28T19:59:44.370Z
---
Implementation scope:
Implement transparent contention retry and last-commit persistence.

Acceptance criteria:
- Implement bounded transparent retry, commit-order semantics, monotonic freshness versioning, and no client expected-version precondition.
- The service/repository/API portion of every parent criterion is implemented without weakening or deleting the red tests.
- Targeted unit, repository, and contract tests are green; failures retain actionable diagnostics.
- Files, commands, and test results are attached as evidence.

Evidence:
- Public mutations accept no expected version, serialize through a conditional poll-version transaction, re-read current state and retry transaction contention up to six times, and allocate separate revision numbers for every accepted write.
- Command: local dev stack + node --test test/integration/collaborative-availability.test.mjs.
- Result: 6/6 integration tests green, including simultaneous opposing writes with two 200 responses, two audit revisions, version +2, and latest persisted state.