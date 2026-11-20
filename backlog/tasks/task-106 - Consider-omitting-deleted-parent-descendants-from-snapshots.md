---
id: TASK-106
title: Consider omitting deleted-parent descendants from snapshots
status: Done
assignee:
  - '@seigiard'
created_date: '2026-11-18T07:27:00Z'
updated_date: '2026-11-20T13:57:00Z'
labels: []
dependencies: []
documentation:
  - >-
    _bmad-output/implementation-artifacts/spec-task-106-delete-parent-descendants.md
priority: low
type: bug
ordinal: 133000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Optional follow-up from preset-v4 review 02-after-fix, bugs+impl-2. At 428d1f8, deleting a repeated parent leaves live child records. Snapshot export includes them; re-import then counts their values as dropped because the parent is absent. A later preset change may also count those hidden values. No live value is lost. This snapshot/cleanup case does not block preset-v4 completion and is separate from the late-edit race in TASK-102.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One GM deletion of a repeated parent block marks the parent and all descendant block records deleted in the same commit, retaining deletion versions for sync and leaving unrelated blocks unchanged.
- [x] #2 Exporting and re-importing after that deletion does not report the deleted descendants’ values as a new loss.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the false loss through a GM deletion and snapshot round trip. Lock regression tests for the deletion batch and import notice.
2. Extend the shared repeat-block deletion composer to mark every non-deleted descendant at its own version. Keep the target first for the existing proposal consumer.
3. Run the local checks and the edit-delivery model, advance the model sync commit, and open an automerge PR.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 owner decision: “106 ... делай”. When the GM deletes a repeated parent block, the same commit marks all descendant block records deleted with a deletion version. Keep these records as sync markers so a stale copy cannot bring them back. Export then import must not count those values as a new loss. Decide in the spec whether old records need a cheap cleanup; no migration unless small. Scope: one GM in one window; no work for minimal-probability races, multiple GMs, or role changes.

Verification: the composer and Chromium tests both failed on test-only commit f8c44f219e25e9c1d46f25137d33d539ab395c6c. The composer omitted two descendant tombstones; the snapshot import warning counted two already-deleted values. On the fixed tree both passed, and Chromium restored the surviving block value. Full checks passed: formatting, lint, types, Bun (3,672 passed and one environment skip), Chromium (589 passed), build, mutation checks (55 killed), and all edit-delivery model configurations. The model excludes repeat blocks, so only its sync commit moved. Formal drift passed. Focused review returned both reports with no in-scope finding. TASK-149 tracks an existing oversized pending-withdrawal case outside this fix.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Deleting a repeat block now puts deletion versions for every live descendant in the same GM command batch. Snapshot re-import no longer reports their values as lost. Unrelated blocks and existing deletion markers stay unchanged. Historical orphan records are not rewritten.
<!-- SECTION:FINAL_SUMMARY:END -->
