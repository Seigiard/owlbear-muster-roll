---
id: TASK-66.2
title: Cover the room-copy behaviors that no test pins
status: Done
assignee: []
created_date: '2026-11-15T08:12:00Z'
updated_date: '2026-11-15T11:07:00Z'
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
- [x] #1 Each room-copy gap cluster A–I in the probe document has a test that passes on the current code and fails under each mutant the cluster lists, or a note in the task explains why a listed mutant is reclassified as equivalent or unreachable.
- [x] #2 A test proves that an import waiting on a routine write completes when the module stops during that write.
- [x] #3 A test runs the lower-copy removal path, including read failures during the import read-back.
- [x] #4 New mutation controls in `tools/mutants/room-copy.json` cover clusters A, B and F, and `bun run mutants room-copy` reports 0 survived and 0 stale.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add RoomCopy boundary tests for probe clusters A–I, with an explicit mapping for all 39 recorded mutants.
2. Add committed A/B/F mutation controls and verify focused room-copy behavior plus controls in a disposable calibration checkout.
3. Run the changed-path full checks, record criterion evidence, and finalize the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Final evidence: `chain.report.md` in the TASK-66.2 run directory.

- All 39 original probe patches replayed in a disposable checkout at `35b94ed21933c9cfc2308ec1ae71386ea1e75e63`: each red run exited 1 without a timeout, source restoration and patch applicability checks passed, and each restored module run exited 0.
- The stop-during-write scenarios use a healthy parent observer; `#22` reaches its parent deadline assertion and `#178` reaches the exact read-count assertion.
- Final `bun run mutants room-copy` in the disposable checkout: 19 killed, 0 survived, 0 stale.
- Final full checks passed: format; lint (188 warnings, 0 errors); typecheck; 3059 unit pass, 1 skip; 521 browser pass; build.
- `src/replica/room-copy.ts` remained byte-identical to the batch baseline.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
RoomCopy coverage now exercises all A–I mutation-probe gaps through the public boundary. The stop-during-write import cases use a bounded healthy-parent observer. All 39 original patches fail without a timeout and restore green. The committed A/B/F controls report 19 killed, 0 survived, and 0 stale. Production RoomCopy code is unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->
