---
id: S-027
type: story
title: "Serve the SPA through private S3, CloudFront, DNS, and TLS"
parent: E-008
dependsOn: [S-026]
estimate: 3
tags: [acm, aws, cloudfront, route53, s3]
archived: false
created: 2026-09-27T18:07:00.771Z
updated: 2026-09-27T18:07:00.771Z
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