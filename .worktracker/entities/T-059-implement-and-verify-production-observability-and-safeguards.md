---
id: T-059
type: task
title: Implement and verify production observability and safeguards
parent: S-028
status: todo
dependsOn: [T-058]
estimate: 2
tags: [aws, green, implementation, observability]
archived: false
created: 2026-09-27T18:09:21.229Z
updated: 2026-09-27T18:19:39.452Z
---
Implementation scope:
Implement structured/redacted logging, retention, dashboards, alarms, required SNS configuration, synthetic health, throttles, reserved concurrency, and bounded poll limits.

Acceptance criteria:
- Synth verifies every signal and control required by S-028 and production configuration cannot omit the alarm destination.
- Logs include correlation, route, status, latency, actor category, poll ID, version, and error code but exclude participant bodies, credentials, authorization headers, and raw tokens.
- Encryption, retention, least privilege, throttling, concurrency, dashboards, and alarm assertions pass.
- Red tests are unchanged and green; commands and results are attached as evidence.