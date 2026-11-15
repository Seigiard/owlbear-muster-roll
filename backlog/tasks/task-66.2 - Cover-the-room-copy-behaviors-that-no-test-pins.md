---
id: TASK-66.2
title: Cover the room-copy behaviors that no test pins
status: To Do
assignee: []
created_date: '2026-11-15T08:12:00Z'
updated_date: '2026-11-15T08:12:00Z'
labels:
  - testing
  - replica
  - room-copy
dependencies: []
documentation:
  - _bmad-output/implementation-artifacts/mutation-probe-2026-11-15.md
parent_task_id: TASK-66
priority: high
type: task
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The mutation probe found 39 room-copy mutants that survive every `src/replica/` test (probe document, "Gaps in room-copy.ts", clusters A–I). Two clusters can hang the page: a stop during a write leaves a stale active write that an import loops on (A), and `waitForWrite` waits on an already resolved promise or on too few writes (B). Lines 511–528, which remove a lower copy, run in no unit test (F). The rest are the owed-write debt, the not-saved notice, sizes and the `exists` flag, write scheduling, the 15500-byte boundary and the publisher signal on a read failure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each room-copy gap cluster A–I in the probe document has a test that passes on the current code and fails under each mutant the cluster lists, or a note in the task explains why a listed mutant is reclassified as equivalent or unreachable.
- [ ] #2 A test proves that an import waiting on a routine write completes when the module stops during that write.
- [ ] #3 A test runs the lower-copy removal path, including read failures during the import read-back.
- [ ] #4 New mutation controls in `tools/mutants/room-copy.json` cover clusters A, B and F, and `bun run mutants room-copy` reports 0 survived and 0 stale.
<!-- AC:END -->
