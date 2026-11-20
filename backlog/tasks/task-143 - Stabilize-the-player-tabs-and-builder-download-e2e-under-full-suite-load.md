---
id: TASK-143
title: Stabilize the player-tabs and builder download e2e under full-suite load
status: To Do
assignee: []
created_date: '2026-11-20T06:59:00Z'
labels:
  - flaky-test
dependencies: []
references:
  - tests/player.e2e.ts
  - tests/builder.e2e.ts
priority: low
type: bug
ordinal: 178000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two browser tests hit the 30 s test timeout in full bun run test:browser runs on the TASK-108 branch and passed when their file ran alone: tests/player.e2e.ts:145 (a player sees a tab for every character in order...) failed once and passed 15/15 alone; tests/builder.e2e.ts:415 (download copy downloads the linked preset document) failed once in page.waitForEvent for the download and passed 31/31 alone. Each full run had exactly one such timeout, in a different test. TASK-139 tracks a similar load flake in tests/selection.e2e.ts. A flaky browser suite makes the local full check unreliable for every task. Recorded in _bmad-output/implementation-artifacts/deferred-work.md under TASK-108.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The cause of each timeout under full-suite load is found and named in the task notes
- [ ] #2 Both tests pass in repeated full bun run test:browser runs
<!-- AC:END -->
