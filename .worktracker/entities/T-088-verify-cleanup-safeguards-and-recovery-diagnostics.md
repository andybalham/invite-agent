---
id: T-088
type: task
title: Verify cleanup safeguards and recovery diagnostics
parent: S-039
status: todo
dependsOn: [T-086, T-087]
tags: [safety, testing, verification]
archived: false
created: 2026-10-03T10:16:13.456Z
updated: 2026-10-03T10:16:13.456Z
---
Test dry runs, missing IDs, malformed manifests, confirmation refusal, reused shared stacks, non-local endpoints, partial failures, reruns, and diagnostic reporting. Confirm cleanup never stops or deletes resources it does not own.