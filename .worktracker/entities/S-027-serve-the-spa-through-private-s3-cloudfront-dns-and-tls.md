---
id: S-027
type: story
title: "Serve the SPA through private S3, CloudFront, DNS, and TLS"
parent: E-008
dependsOn: [S-026]
estimate: 3
tags: [acm, aws, cloudfront, design-authority, route53, s3]
archived: false
created: 2026-09-27T18:07:00.771Z
updated: 2026-09-28T18:20:22.108Z
---
Outcome:
Serve the SPA through private S3, CloudFront, DNS, and TLS.

Source:
Architecture §4, §15

Acceptance criteria:
- The SPA bucket blocks public access and CloudFront alone reads it through OAC.
- CloudFront caches hashed assets immutably, treats HTML as mutable, disables API caching, forwards required headers/methods, and never rewrites /api/* errors.
- A us-east-1 ACM certificate and Route 53 alias provide HTTPS at invite-agent.10printiamcool.com with HTTP redirect.
- CDK assertions validate origins, behaviors, security headers, SPA route rewrite boundaries, DNS, and TLS.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.