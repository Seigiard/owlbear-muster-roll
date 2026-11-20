---
id: TASK-105
title: Consider invalid local values in nested dice rolls
status: Done
assignee:
  - '@claude'
created_date: '2026-11-18T07:27:00Z'
updated_date: '2026-11-20T06:47:00Z'
labels: []
dependencies: []
priority: low
type: bug
ordinal: 132000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Optional follow-up from preset-v4 review 02-after-fix, adversarial-2 and adversarial-3. At 428d1f8, local-field-values.ts selects displayed roll overlays by leaf target identity. Constructed cases: invalid text in an enclosing bonus field is omitted from a child roll; invalid text in a source child can affect a duplicated child with the same leaf instance id. The owner asked to prioritize ordinary valid-input flows. These invalid-input combinations do not block TASK-79/80/88/77. Review findings are source-confirmed, not live-room reproductions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 If selected, a child roll uses local values and errors from its exact block and its ancestors: an invalid value in an enclosing (parent) field reaches the child roll as a field error.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Resolve each local value's field id from the rolled row with resolveFieldReference and keep it only when its target is the resolved record (enclosing block at scope depth, or plain row). 2. Pass the template layout to the dice button through DiceSheetContext. 3. Unit tests in local-field-values.test.ts and a nested e2e twin in repeat-tab-dice.e2e.ts.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validity check 2026-11-20 at 34131dc. The source/duplicate crossover case is closed: shownForRoll's sameTarget compares the full block address through sameAddress (commits 39e3176, 080a532), and a probe confirmed a duplicated child under another parent instance does not see the source child's invalid value. The remaining case is open: shownForRoll (src/ui/sheet/local-field-values.ts) reaches only the rolled row and plain rows, so an invalid value in an enclosing parent field is omitted from a child roll. AC narrowed to that case.

Fix at 46bc653: shownForRoll(values, layout, row) resolves each field id with resolveFieldReference (import only; no change in src/core/) and keeps a local value only when its target is exactly the resolved record: the enclosing block at the field's scope depth (prefix of the rolled block's address) or the plain row. DiceRow dropped target/fieldIds; DiceSheet carries layout. Evidence: unit test 'an input error in an enclosing-block field stops the nested roll with a field error' (rollDiceCell returns {code:'field', field:'hp'}); e2e 'an input error in the NPC field stops a roll in its nested block' (message 'Нельзя бросить: поле «Хиты» пустое или не число', no notification). Both go red when fieldSource ignores enclosing blocks (checked by a temporary mutation). Checks: oxfmt, lint, typecheck, bun test 3636 pass, bun run mutants 55/55 killed, bun run build, bun run test:browser 587 passed (before review patches) and the 4 roll e2e files 23 passed after them.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A roll in a nested repeat block now gets the local values of its enclosing blocks: an input error in a parent field stops the child roll with that field's error and sends nothing. shownForRoll picks each local value by the record the formula resolver reads, so the own block hides an enclosing block's field of the same id and a block under another parent does not leak in. UI files only; src/core unchanged. Verified by unit tests, a nested e2e twin, mutants, and the full browser suite. No deferred work.
<!-- SECTION:FINAL_SUMMARY:END -->
