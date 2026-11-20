---
id: TASK-145
title: Keep repeat-row fields out of sheet-scope dice lookup
status: To Do
assignee: []
created_date: '2026-11-20T07:42:00Z'
labels:
  - review-follow-up
dependencies: []
references:
  - TASK-101
  - src/core/preset.ts
  - src/core/dice-roll.ts
priority: medium
type: bug
ordinal: 180000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A valid v4 preset can reuse a field id in a repeat row and the sheet scope. When a repeat row with a check field named `bonus` comes before the sheet row with numeric `bonus = 4`, a sheet dice cell running `1d6 + bonus` returns 1 with a die face of 1. Moving the repeat row after the sheet row returns 5. Reproduced through `parsePresetFile` and `rollDiceCell` during TASK-101 review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A sheet dice cell with a die face of 1 and sheet bonus 4 returns 5 in either row order, even if the repeat row declares `bonus` with a different type.
- [ ] #2 A dice cell in the repeat row still reads its own field first.
<!-- AC:END -->
