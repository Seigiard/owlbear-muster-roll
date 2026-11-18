---
id: TASK-66
title: 'Epic: close the replica test gaps found by the mutation probe'
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-15T08:12:00Z'
updated_date: '2026-11-15T15:21:00Z'
labels:
  - testing
  - replica
dependencies: []
documentation:
  - _bmad-output/implementation-artifacts/mutation-probe-2026-11-15.md
  - _bmad-output/implementation-artifacts/task-66-verification.md
priority: high
type: task
ordinal: 94000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The 36 hand-written controls in `tools/mutants/` cover only rules that the test author chose. A mechanical mutation probe of `catch-up.ts`, `room-copy.ts` and `window-publisher.ts` (778 mutants) found 146 that survive the whole `src/replica/` suite: 82 are real gaps, 49 are equivalent, 15 are unreachable, and one confirmed defect sits behind them. The probe document holds every survivor, its verdict and a test scenario for each gap. Order: the defect first, then room-copy (two gaps can hang the page), then catch-up, then window-publisher.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each subtask is Done.
- [x] #2 A rerun of the probe (generator in the probe document) on the three modules finds no survivor that the probe document or a later note does not mark equivalent or unreachable.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Implement TASK-66.1, then 66.2, 66.3 and 66.4 through separate TDD chains and ticket worktrees.
2. Merge each validated chain into implement-spec-66.
3. Repeat all three mutation suites and the mechanical probe in a disposable checkout; explain every survivor.
4. Run applicable integration checks and one closing review, then finalize acceptance criteria.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All four subtasks are Done and merged into implement-spec-66. Final source/test revision: 44e21453d8146c43ca38e36bdeb24e7bfa2f7a13.

The post-review probe confirms 788 mutations: 720 test failures, 65 survivors and 3 unit timeouts. Every survivor is explained: 50 equivalent, 15 unreachable. The three timeouts are not assertion-red evidence. Original publisher D is reclassified under the approved unconditional restart cue. The repository verification note records every surviving source anchor and reason.

Final checks: 53 mutation controls killed, none survived or stale; format, lint, typecheck, 3089 unit tests (1 skip), 521 browser tests and build passed. One browser focus failure did not recur in ten focused repeats or the unchanged full recheck. Its cause remains unverified.

One closing review loop found a shared metadata-size test oracle. A separate test-writer corrected it and calibrated both comparator mutations and a biased-helper control. A fresh confirming round found no blocking defects. Deferred items: observer stderr diagnostics, existing spy cleanup, optional expanded evidence bundle, unverified oversized headers and cold-start lifecycle, and the intermittent NPC focus observation. No push, PR or deployment.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A delayed state request now survives ordinary catch-up. Replica replacement now cues an old window before the new publisher has projected. Regression tests and controls pin the original probe gaps.

All subtasks and parent criteria are verified. Final probe: 720 test failures, 65 classified survivors, 3 separately recorded timeouts. Local checks and closing review passed. The verification note records the independent test oracle correction, limits, deferred findings and browser recheck history.
<!-- SECTION:FINAL_SUMMARY:END -->
