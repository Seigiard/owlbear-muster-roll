---
id: TASK-152
title: Keep Builder formula references when nested repeats share an id
status: In Progress
assignee:
  - '@seigiard'
created_date: '2026-11-20T15:36:00Z'
updated_date: '2026-11-20T16:10:00Z'
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
- [ ] #1 Reject any repeat.id that equals an enclosing repeat scope id; allow the same id in separate branches.
- [ ] #2 Every field reference in a formula or dice formula resolves in its own block, an enclosing block or the sheet. Report each missing id with its formula and place.
- [ ] #3 Room preset upload and file import reject both problems. Builder shows each problem at its place without blocking editing, and handles download/export as for existing preset problems.
- [ ] #4 Builder refuses a manual repeat id rename that would conflict with an enclosing or enclosed repeat scope.
- [ ] #5 Both preset format docs and the glossary state the rules, and shipped presets and docs/example-preset.json still pass the preset parse tests.
- [ ] #6 Every strict preset parse, including decode of the installed preset, applies the same rules. TASK-145 behavior is unchanged.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add both failures to the shared preset validation and Russian problem messages.
2. Refuse conflicting repeat id commits in the Builder using its existing id input; keep draft warnings and export behavior on the shared path.
3. Prove file rejection, branch-local resolution and Builder editing with regression tests. Update both format docs and the glossary.
4. Run path-selected checks and ship the PR with automerge.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner decision (2026-11-20): «152 делай валидацию + запретить одинаковый id». Replace the original same-id rename expectation with preset validation and a Builder repeat-id rename guard.

Planning question: parsePresetFile also serves decodePreset for already-installed room presets. Applying the two new errors there would make an affected room preset unreadable and block a corrected replacement upload (src/core/compose.ts:175-200,959-972). No production edits made pending the stored-preset compatibility decision.

Orchestrator decision: keep already-installed presets readable when their only failures are the new rules or TASK-145 shadowed-field-id, if the latter fits the same small change. Strict validation remains at upload and file import; Builder retains warnings and download gating.

Final owner decision (2026-11-20): «согласен» to one rule set everywhere; overrides the earlier option A. Keep TASK-145 unchanged. Accepted risk: an installed preset that violates either new rule is unreadable, and the GM cannot replace it by normal upload. No such installed presets are known to the only GM.
<!-- SECTION:NOTES:END -->
