---
id: TASK-66.3
title: Cover the catch-up behaviors that no test pins
status: To Do
assignee: []
created_date: '2026-11-15T08:12:00Z'
labels:
  - testing
  - replica
  - catch-up
dependencies:
  - TASK-66.1
documentation:
  - _bmad-output/implementation-artifacts/mutation-probe-2026-11-15.md
parent_task_id: TASK-66
priority: medium
type: task
ordinal: 93000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The mutation probe found 27 catch-up mutants that survive every `src/replica/` test (probe document, "Gaps in catch-up.ts", clusters A–H): when `answerSeen` is set, the `gm-return` request delay, `answersOwn` for a foreign `state`, GM answers and held requests, stale-`r` guards, generation adoption, and the digest bookkeeping for drift. One of them (#321) matters most: if `answersOwn` throws on a live client, `handleRoomMessage` stops and the client never adopts a higher generation. The confirmed defect in the same module is TASK-66.1, so this task starts after it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each catch-up gap cluster A–H in the probe document has a test that passes on the current code and fails under each mutant the cluster lists, or a note in the task explains why a listed mutant is reclassified.
- [ ] #2 A test pins that `answersOwn` returns false, without throwing, on a live client and for a foreign `r` during a catch-up.
- [ ] #3 The drift tests use a clock that does not start at 0, so a burst window measured as an absolute time fails them.
- [ ] #4 New mutation controls in `tools/mutants/catch-up.json` cover clusters D, F and G, and `bun run mutants catch-up` reports 0 survived and 0 stale.
<!-- AC:END -->
