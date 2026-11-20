---
id: TASK-138
title: >-
  Separate the names of the dice extension failure type and the tagged failure
  class
status: Done
assignee:
  - '@seigiard'
created_date: '2026-11-20T06:31:00Z'
updated_date: '2026-11-20T14:29:00Z'
labels:
  - replica
dependencies: []
priority: low
ordinal: 177000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two exported names collide: `src/replica/dice-extension.ts:53` exports `type DiceExtensionFailure`, the union `{ code: 'failed'; reason } | { code: 'stopped' }` that `DiceExtension.roll` returns; `src/platform/ports.ts:133` exports `class DiceExtensionFailure`, the TaggedError that `roll-flow.ts:231` reports and `src/replica/failures.ts` lists. TASK-123 removed `RollDiceFailure`, which kept the two apart inside roll-flow; `roll-flow.test.ts` now imports the union under the class's name. Rename the union (for example `DiceRollFailure` collides with core/dice-roll, so pick a free name such as `DiceExtensionRollFailure`) and update its users. Found in the TASK-123 review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `grep -rn 'type DiceExtensionFailure' src` is empty and the union has one name distinct from the class
- [x] #2 Full check passes with no behaviour change
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Rename the replica roll failure union to DiceExtensionRollFailure and update its type references. Keep the tagged class and runtime behavior unchanged. Run the full changed-path checks and formal drift check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20: The declaration and seven type references now use DiceExtensionRollFailure. `grep -rn 'type DiceExtensionFailure' src` returned no matches. The tagged class and tag retain DiceExtensionFailure. Reversing the identifier substitution gives the original contents of both files, and Bun emits identical JavaScript for both. All 83 focused tests passed before and after the rename. No formal coverage lists either edited file; formal/drift.sh passed.

Browser load cases (TASK-142): the default run passed 582 tests and failed six in tests/access.e2e.ts (lines 219, 297, 308, 346, 384, and 418); running that file alone passed all 16. After merging master without conflicts, a four-worker full run passed 588 tests and timed out in tests/selection.e2e.ts:135 (missing t-s2 in the selection poll). This exact timeout is already recorded in TASK-139, which was archived as a duplicate of TASK-142.

The isolated selection file passed 8/8. The full rerun after merging master (`bun run test:browser -- --workers=4 --retries=1`) passed all 589 without any retry. Formatting, lint, typecheck, build, and formal drift passed after merging master. The full Bun suite passed 3,672 tests with one skip and no failures, and the mutation suite killed all 55 mutants.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The dice extension roll result uses DiceExtensionRollFailure. The tagged DiceExtensionFailure class is unchanged. Both edited files emit identical JavaScript to the original files. Full checks passed; earlier isolated browser reruns confirmed the existing TASK-142 load cases. No new tests or follow-up tasks.
<!-- SECTION:FINAL_SUMMARY:END -->
