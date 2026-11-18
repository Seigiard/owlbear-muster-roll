---
id: TASK-106
title: Consider omitting deleted-parent descendants from snapshots
status: To Do
assignee: []
created_date: '2026-11-18T07:27:00Z'
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
- [ ] #1 If selected, exporting and re-importing after deleting a parent does not report its already-deleted descendant values as a new loss.
<!-- AC:END -->
