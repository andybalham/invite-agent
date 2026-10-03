---
id: T-072
type: task
title: Define scripted initial data and test isolation rules
parent: S-034
status: done
dependsOn: [T-071]
tags: [smoke-test, test-data, testing]
archived: false
created: 2026-10-03T09:03:30.174Z
updated: 2026-10-03T09:21:46.326Z
---
Specify deterministic organiser, poll, dates, location, participant, and availability data. Define how the test creates its initial state, avoids existing DynamoDB data, supports repeated runs, and cleans up or isolates generated records.