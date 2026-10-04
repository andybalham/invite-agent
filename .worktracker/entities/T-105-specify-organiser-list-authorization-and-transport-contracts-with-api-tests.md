---
id: T-105
type: task
title: Specify organiser list authorization and transport contracts with API tests
parent: S-044
status: done
dependsOn: [T-102]
tags: [api-test, authorization, contract-test, my-polls]
archived: false
created: 2026-10-03T16:43:21.849Z
updated: 2026-10-04T08:31:41.646Z
---
Write failing server/API integration tests for authenticated owned summaries under all filters and search, missing/invalid identity (401), public-token-only requests (401), forged owner identifiers and attempted cross-owner cursor reuse where applicable. Exercise another organiser opening/managing the returned/guessed poll ID and expect existing server ownership denial (403). Validate malformed requests using existing error codes and ensure rejected responses disclose no foreign titles/summaries. Compare local and Lambda adapter contracts using verified identity stubs without claiming a real Cognito sign-in test. Prove list/filter/search requests produce no poll writes or audit revisions. Cover MP-US-02 and MP-US-11.