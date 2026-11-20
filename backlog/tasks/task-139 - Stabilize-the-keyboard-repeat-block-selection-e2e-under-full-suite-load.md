---
id: TASK-139
title: Stabilize the keyboard repeat-block selection e2e under full-suite load
status: To Do
assignee: []
created_date: '2026-11-20T06:41:00Z'
labels:
  - flaky-test
dependencies: []
references:
  - tests/selection.e2e.ts
priority: low
type: bug
ordinal: 177000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tests/selection.e2e.ts:135 (a GM selects the token of one repeat block from the keyboard) failed once in a full bun run test:browser run on the TASK-112 branch: the map selection poll timed out after 5 s with one of the two expected tokens missing. It passed 3/3 alone. A flaky browser test makes local full checks unreliable for every task. Recorded in _bmad-output/implementation-artifacts/deferred-work.md under TASK-112.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The cause of the missing token selection under load is found and named in the task notes
- [ ] #2 The test passes in repeated full bun run test:browser runs
<!-- AC:END -->
