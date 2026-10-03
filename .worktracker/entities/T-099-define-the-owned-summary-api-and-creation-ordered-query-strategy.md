---
id: T-099
type: task
title: Define the owned-summary API and creation-ordered query strategy
parent: S-043
status: todo
dependsOn: [T-098]
tags: [api, design, dynamodb, my-polls]
archived: false
created: 2026-10-03T16:43:21.280Z
updated: 2026-10-03T16:43:21.280Z
---
Inspect actual contracts/repositories/table setup and architecture before choosing routes or keys. Define authenticated list request/response/error schemas, Draft/Open/Closed versus Active query grouping, title-search semantics, immutable createdAt, proposed-date summaries and participant counts. Resolve storage/query design: architecture currently describes OwnerIndex ordered by updatedAt, which cannot directly deliver globally newest-created-first results. Specify an owner-scoped creation-order strategy, existing-data/index compatibility, bounded summary reads and any cursor/page-size rules. Apply ownership and search/filter rules across the full result set, not only the first database page. Document cursor/query/identity binding if applicable and local/production table/index/IAM handoff needs in .docs/architecture.md. Make no deployment or migration in this planning task.