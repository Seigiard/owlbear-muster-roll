---
id: TASK-152
title: Keep Builder formula references when nested repeats share an id
status: To Do
assignee: []
created_date: '2026-11-20T15:36:00Z'
labels:
  - review-follow-up
dependencies: []
references:
  - src/core/formula-rename.ts
  - TASK-150
priority: low
type: bug
ordinal: 186000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A valid Builder preset gives a repeat tab and its nested repeat section the same repeat id, `npc`. In the tab scope, add `bonus`. In the nested section, add the dice formula `1d6+bonus`. Rename `bonus` to the free id `damage_bonus`. The downloaded preset passes validation, but its formula still reads `1d6+bonus` and the reference cannot resolve. Reproduced through `renameFieldId`, `presetProblems`, and `resolveFieldReference` while reviewing TASK-150. TASK-150 does not change formula lookup or how a free rename resolves references.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When a field in a repeat tab is renamed to a free id, formulas in a nested repeat section with the same repeat id still refer to that field after the rename.
- [ ] #2 The renamed field does not change formulas that read another field in another scope.
<!-- AC:END -->
