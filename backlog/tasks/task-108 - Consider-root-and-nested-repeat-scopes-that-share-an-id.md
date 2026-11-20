---
id: TASK-108
title: Consider root and nested repeat scopes that share an id
status: Done
assignee:
  - '@claude'
created_date: '2026-11-18T08:10:00Z'
updated_date: '2026-11-20T07:00:00Z'
labels:
  - format-v4
  - review-follow-up
dependencies: []
references:
  - src/core/preset.ts
  - TASK-79
priority: low
type: bug
ordinal: 135000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Optional follow-up from runtime review 03-after-fix, bugs+impl-1, at 3d0c96a. A constructed valid preset places npc -> attack before an unrelated root attack with different fields. The parser accepts parent-local ids, but root lookup can select the nested row. This is distinct from TASK-100, which covers a parent and child sharing an id. Source-confirmed; no user occurrence or parent runtime reproduction of this preset is claimed. Grade minor under the owner ordinary-flow completion boundary. This does not block the current completion scope and does not authorize narrowing the published parent-local id contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 If selected, root and nested scopes with the same id retain their own fields for rendering, editing and token targets regardless of layout order.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add regressions: root row repeat 'attack' beside a repeat section npc whose row repeat is also 'attack', in three layout orders, through repeatSectionByPath, repeatSectionPlaceByPath (place), targetFields (edit) and tokenCellPlace (token target); also a root repeat section and a root repeat tab after the nested row.
2. Fix the root row lookup in repeatScopeByPath: a root row repeat lives only in a plain section.
3. Derive repeatSectionByPath and tokenCellPlaceAtPath from repeatScopeByPath so the lookup exists once.
4. Run the full check set.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: the one-id root lookup took a row repeat from any section of a plain tab, including a repeat section whose rows are nested scopes. Three copies carried it: repeatScopeByPath and repeatSectionByPath (src/core/preset.ts) and tokenCellPlaceAtPath (src/core/link-target.ts). All three now go through repeatScopeByPath, which takes a root row repeat only from a plain section. resolveFieldReference and repeatScopePathAt keep their signatures; formula lookup starts from the cell's own path, so it is unaffected (TASK-100 owns the shared parent/child id case).
Evidence: 6 new preset tests, 1 field-patch test and 1 tokenCellPlace test failed before the fix (nested 'hit' field or the NPC tab place returned) and pass after it. Checks at 77dd0b9 merged with origin/master: oxfmt, lint (0 errors), typecheck, bun test 3658 pass, bun run mutants 55/55 killed, bun run build ok. Browser: full run before the merge had one timeout at tests/player.e2e.ts:145 that passed when the file ran alone (15/15).

AC#1 evidence: the root path ['attack'] returns the root row (fields attack_name, dmg) and the nested path ['npc','attack'] the nested row (attack_name, hit) in nested-first, root-first and earlier-tab layouts (src/core/preset.test.ts). Rendering reads block scopes through repeatSectionByPath (src/ui/sheet/preset-section.tsx:304/942), editing through targetFields (src/core/field-patch.test.ts), token targets through tokenCellPlace (src/core/link-target.test.ts) and the block's tab through repeatSectionPlaceByPath place (preset.test.ts). Browser after merging master: 587 passed, 1 load timeout at tests/builder.e2e.ts:415 that passed 31/31 alone; recorded with the earlier player.e2e.ts:145 timeout in TASK-143.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Root and nested repeat scopes that share an id now keep their own fields. The one-id root lookup in repeatScopeByPath took a row repeat from any section of a plain tab, including a repeat section whose rows are nested scopes, so a nested npc -> attack row placed first shadowed the root attack row for rendering, field edits and token targets. It now takes a root row repeat only from a plain section. repeatSectionByPath and tokenCellPlaceAtPath (link-target.ts), which held their own copies of the same lookup, now derive from repeatScopeByPath. The parent-local id contract is unchanged; formula lookup with a shared parent/child id stays with TASK-100. Verification: 8 regressions red before the fix and green after; bun test 3658 pass; mutants 55/55 killed; lint, typecheck, format, build pass; browser suite green except one load timeout per full run, passing alone, tracked in TASK-143.
<!-- SECTION:FINAL_SUMMARY:END -->
