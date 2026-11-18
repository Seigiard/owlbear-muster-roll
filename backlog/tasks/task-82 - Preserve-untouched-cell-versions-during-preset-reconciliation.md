---
id: TASK-82
title: Preserve untouched cell versions during preset reconciliation
status: Done
assignee:
  - '@openai'
created_date: '2026-11-16T15:15:00Z'
updated_date: '2026-11-17T20:07:00Z'
labels: []
dependencies: []
references:
  - src/replica/composers.ts
  - src/core/preset-migrate.ts
  - _bmad-output/implementation-artifacts/spec-task-76-block-records.md
priority: high
type: bug
ordinal: 105000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Review of TASK-76 found two preset-change edge cases in src/replica/composers.ts. composePresetUpload reissues every planned cell at the upload version, so removing one field can overwrite a concurrent edit of an untouched field; the reviewer reproduced hp=10 instead of hp=20. mintedPatch omits fields removed by stripToTemplate rather than emitting null cells, so a write after an interrupted preset upload can retain obsolete values on merge. The owner requested follow-up issues instead of extending TASK-76. These scenarios concern preset changes concurrent with edits or interrupted uploads; ordinary different-cell editing is covered by the passing TASK-76 tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Removing armor while another GM updates hp preserves the exact concurrent hp value and its cell version.
- [x] #2 A field removed by the current preset receives a versioned clear during subsequent reconciliation, so old values cannot return through merge.
- [x] #3 Targeted regressions cover concurrent preset upload and edit, and a field write after an interrupted upload.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Establish a two-GM room-rig oracle where GM B performs the hp write through the public client path after GM A requests the preset diff and before GM A confirms the upload; require a base red for the literal stored tuple.
2. Add or repair only the composer/reconciliation behavior that the calibrated owners prove, preserving the difference between persisted GM writes and pending player proposals.
3. Run the focused engine owners, then the repository checks selected by the changed source/test paths. Record raw evidence and leave the task blocked if the concurrency contract cannot be calibrated.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CURRENT STATUS — Done for the recorded TASK-82 removal scenarios. Integrated at 9f6f5b3; final reviewed source a6af377. All six checks passed: 3415 unit pass, one DOM skip, 572 browser pass. Reviews completed mixed 6/6 and final 2/2. The stale-preset/newer-field data-loss construction remains deferred, not fixed; see the TASK-82 spec and deferred-work.md. The earlier rejected candidate below remains historical.

Historical evidence below concerns the rejected candidate and does not describe the integrated state.

Historical status — earlier 2026-11-17 attempt:
BLOCKED, NOT MERGED. Candidate 496ec87 on feature/preset-v4-task-82 is preserved. The corrected concurrent-edit test also passes on old source and does not reproduce the reported race. The candidate additionally fails the existing player-proposal strip owner because removed-field clears enter pending proposals. Needs a faithful concurrent oracle and a correct persisted/pending composition boundary.

The following notes describe the earlier rejected attempt.

Bounded autonomous attempt preserved clean candidate 496ec87d9f9b3f61cf855e04d49c2e7fee087531 on feature/preset-v4-task-82; it was not merged. Correcting the concurrent-owner mock sender made that test pass on the actual production base as well, so the test does not yet reproduce the reported race. This is not evidence that the original issue is absent. The candidate also breaks the existing player-proposal strip owner: a removed-field null clear enters pending proposals and is refused. A continuation needs a faithful concurrent oracle and an explicit composition boundary between persisted GM reconciliation and pending player proposals. Evidence: local artifact run preset-v4-78-87-20261117/task-82/orchestrator.report.md, corrected-lock-red-base.log and focused-full.log.

Earlier attempt: Blocked; candidate 496ec87 remains on feature/preset-v4-task-82 and is NOT merged. The corrected concurrent-edit test also passes on the old source, so the reported race still needs a faithful regression. The candidate additionally fails the existing player-proposal test because removed-field null clears enter pending proposals. This pass skips further repair; acceptance remains open.

2026-11-17 window 3: restarted from integration bd81234. The old self-origin-frame red is rejected. The new owner uses two actual GM clients and only counts a red caused by the stored tuple overwrite.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Preset uploads preserve received concurrent cell tuples; persisted GM reconciliation clears obsolete fields, while pending/player composition omits those clears. Two-GM, interrupted-upload and player-proposal owners were calibrated; the browser fixture now requires the original unchanged str tuple. Verified source a6af377: 3415 unit pass, 1 DOM skip, 572 browser pass; format, lint, types and build passed. Reviews: mixed 6/6 and final 2/2. Deferred risk: a stale preset can misclassify a newly added field as removed and write a winning null; code-traced, not runtime-reproduced, outside the recorded removal occurrences. Provenance needs a separate contract decision; final review is not empty.
<!-- SECTION:FINAL_SUMMARY:END -->
