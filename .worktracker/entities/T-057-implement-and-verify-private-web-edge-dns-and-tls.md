---
id: T-057
type: task
title: "Implement and verify private web edge, DNS, and TLS"
parent: S-027
status: todo
dependsOn: [T-056]
estimate: 2
tags: [green, implementation, S-027]
archived: false
created: 2026-09-27T18:08:43.103Z
updated: 2026-09-27T18:19:39.384Z
---
Implementation scope:
Implement private SPA bucket, OAC, CloudFront behaviors/function, us-east-1 certificate, Route 53 alias, HTTPS redirect, and security headers.

Acceptance criteria:
- API is never SPA-rewritten/cached; assets/HTML use intended caching; public S3 access is blocked; domain/TLS assertions pass.
- Every acceptance criterion in parent story S-027 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.