---
id: TASK-145
title: Reject repeat fields that reuse an enclosing field id
status: In Progress
assignee:
  - '@codex'
created_date: '2026-11-20T07:42:00Z'
updated_date: '2026-11-20T13:31:00Z'
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
- [ ] #1 Preset parsing rejects a field id reused by a repeat scope and any enclosing scope, regardless of row order, with a Russian diagnostic naming the id and both locations. Upload, import, and Builder use this validation.
- [ ] #2 Unrelated scopes may still reuse field ids, and repeat-id rules stay unchanged, including TASK-100 and TASK-108 cases.
- [ ] #3 The published format, product format spec, and Scope glossary entry document the rule; the example and bundled presets parse successfully.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add order-independent enclosing-field validation to the rules shared by file parsing and Builder. Keep repeat ids and dice lookup unchanged.
2. Show the Russian diagnostic with both cell locations. Update the format reference, product spec, glossary, and example.
3. Verify the regression, valid repeat-id reuse, bundled presets, and the changed-path checks; open a PR with automerge.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner decision (2026-11-20): «145 валидация, ошибки не нужны т.к. я один ГМ, у меня ща нет таких проблем. а позднее и не будет». Replace the dice lookup fix with preset validation, with no compatibility mode or warning. Scope: one GM in one window; no race, multiple-GM, or role-change work.

TASK-100 and TASK-108 primarily cover repeat-id reuse. TASK-100 also includes a field-shadowing subcase that the new contract rejects; keep valid ancestor and local lookup controls using distinct field ids. Room snapshots contain values, not a preset; Builder preset import, window upload, and encoded-preset decoding go through parsePresetFile, and Builder draft problems use presetProblems.
<!-- SECTION:NOTES:END -->
