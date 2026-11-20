---
id: TASK-150
title: Keep Builder formula references when a conflicting field id is corrected
status: To Do
assignee: []
created_date: '2026-11-20T14:17:00Z'
labels:
  - review-follow-up
dependencies:
  - TASK-145
references:
  - src/core/formula-rename.ts
  - src/builder/document.ts
priority: low
type: bug
ordinal: 185000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A single GM edits a valid Builder draft with a sheet field `bonus`, a repeat field `attack_bonus`, and a dice formula `1d6+bonus` in the repeat. The GM renames the sheet field to `attack_bonus`, sees the duplicate warning, and types `bonus` again. The warning clears and export works, but the dice formula still says `1d6+attack_bonus` and reads the repeat field. Reproduced through Builder renameField, builderProblems and downloadText while completing TASK-145.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When a GM corrects a conflicting manual field id, formulas that referred to the original field still refer to it after the draft becomes valid.
- [ ] #2 Renaming a field to an available id still rewrites its references, not references to unrelated fields.
<!-- AC:END -->
