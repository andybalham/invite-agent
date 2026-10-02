---
id: T-050
type: task
title: Specify reopen and close-again lifecycle with failing automated tests
parent: S-024
status: done
dependsOn: [T-047, T-049]
estimate: 1
tags: [red, S-024, test-first]
archived: false
created: 2026-09-27T18:08:42.602Z
updated: 2026-10-02T16:49:27.157Z
---
Purpose:
Lock S-024 / US-28–US-30 behavior before implementation.

Red evidence (2026-10-02):
- `npm run build`: passed before specification runs.
- `node --test test/foundation/reopening.test.mjs`: 0/2 passed; missing reopenPollRequestSchema and repository.reopenPoll.
- `node --test test/integration/reopening.test.mjs`: 0/4 passed; missing reopen route returned 404 rather than 200/400/409. Isolated real DynamoDB Local fixtures successfully created, published and closed polls first.
- `node node_modules/@playwright/test/cli.js test test/e2e/reopening.spec.ts --workers=1`: browser launch first required sandbox escalation; authorised run reached a closed poll then failed waiting for absent Reopen poll… control.

Specification:
Foundation contracts and version-guarded atomic persistence; integration same/different close, provisional state, restored add/rename/delete/toggle and ranking, preserved history/privacy, invalid confirmation/ownership/state and concurrent reopen; desktop/mobile browser journeys with confirmation cancel/Escape, keyboard Enter/Space, cross-client lifecycle updates, design hierarchy, provisional styling, responsive layout and distinct history rendering.

Files: test/foundation/reopening.test.mjs, test/integration/reopening.test.mjs, test/e2e/reopening.spec.ts. No commits or protected-branch writes.