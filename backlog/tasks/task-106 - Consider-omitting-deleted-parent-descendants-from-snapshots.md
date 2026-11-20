---
id: TASK-106
title: Consider omitting deleted-parent descendants from snapshots
status: In Progress
assignee:
  - '@seigiard'
created_date: '2026-11-18T07:27:00Z'
updated_date: '2026-11-20T13:28:00Z'
labels: []
dependencies: []
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
- [ ] #1 One GM deletion of a repeated parent block marks the parent and all descendant block records deleted in the same commit, retaining deletion versions for sync and leaving unrelated blocks unchanged.
- [ ] #2 Exporting and re-importing after that deletion does not report the deleted descendants’ values as a new loss.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 owner decision: “106 ... делай”. When the GM deletes a repeated parent block, the same commit marks all descendant block records deleted with a deletion version. Keep these records as sync markers so a stale copy cannot bring them back. Export then import must not count those values as a new loss. Decide in the spec whether old records need a cheap cleanup; no migration unless small. Scope: one GM in one window; no work for minimal-probability races, multiple GMs, or role changes.
<!-- SECTION:NOTES:END -->
