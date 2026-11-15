---
id: TASK-66
title: 'Epic: close the replica test gaps found by the mutation probe'
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-11-15T08:12:00Z'
updated_date: '2026-11-15T08:51:00Z'
labels:
  - testing
  - replica
dependencies: []
documentation:
  - _bmad-output/implementation-artifacts/mutation-probe-2026-11-15.md
priority: high
type: task
ordinal: 90000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The 36 hand-written controls in `tools/mutants/` cover only rules that the test author chose. A mechanical mutation probe of `catch-up.ts`, `room-copy.ts` and `window-publisher.ts` (778 mutants) found 146 that survive the whole `src/replica/` suite: 82 are real gaps, 49 are equivalent, 15 are unreachable, and one confirmed defect sits behind them. The probe document holds every survivor, its verdict and a test scenario for each gap. Order: the defect first, then room-copy (two gaps can hang the page), then catch-up, then window-publisher.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each subtask is Done.
- [ ] #2 A rerun of the probe (generator in the probe document) on the three modules finds no survivor that the probe document or a later note does not mark equivalent or unreachable.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Implement TASK-66.1, then 66.2, 66.3 and 66.4 through separate TDD chains and ticket worktrees.
2. Merge each validated chain into implement-spec-66.
3. Repeat all three mutation suites and the mechanical probe in a disposable checkout; explain every survivor.
4. Run applicable integration checks and one closing review, then finalize acceptance criteria.
<!-- SECTION:PLAN:END -->
