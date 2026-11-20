---
title: 'TASK-108: root and nested repeat scopes that share an id'
type: 'bugfix'
created: '2026-11-20'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `repeatSectionByPath(layout, ['attack'])` and `repeatScopeByPath(layout, ['attack'])` return the nested row repeat `npc -> attack` when its repeat section comes before an unrelated root row repeat `attack`. The parser accepts this preset (`repeat.id` is unique only among repeat scopes in its parent scope), so the root scope renders, edits and links tokens against the nested row's fields.

**Approach:** Fix the root lookup in `src/core/preset.ts`: a one-id path matches a row repeat only when that row sits in a non-repeat section of a non-repeat tab. Keep one lookup by deriving `repeatSectionByPath` from `repeatScopeByPath`. Keep the parent-local id contract; do not touch the formula ancestor lookup (TASK-100) or TASK-101 cleanup.

</frozen-after-approval>

## Implementation Notes

- Root cause: the one-id root lookup took a row repeat from any section of a plain tab, including a repeat section whose rows are nested scopes. Three copies of the lookup carried it: `repeatScopeByPath` and `repeatSectionByPath` in `src/core/preset.ts`, and `tokenCellPlaceAtPath` in `src/core/link-target.ts`.
- `repeatScopeByPath` now matches a root row repeat only in a plain section. `repeatSectionByPath` derives from it through `repeatSectionPlaceByPath`, and `tokenCellPlaceAtPath` resolves its scope through it, so the lookup exists once.
- Regressions (red before the fix, green after): `src/core/preset.test.ts` (root and nested paths in three layout orders, plus the parser accepting each layout), `src/core/field-patch.test.ts` (`targetFields` for an edit), `src/core/link-target.test.ts` (`tokenCellPlace` for a token target).
- `scopeFallback` (id-only fallback for formula scopes) is untouched: formula ancestor lookup belongs to TASK-100.
- Surprise: `bun run lint --fix` rewrote unrelated files; those edits were reverted. One `tests/player.e2e.ts:145` timeout in the full browser run passed when the file ran alone (15/15).

## Review Triage Log

- `scopeFallback` picks a nested row before the root one — false for this case: every caller (`resolveFieldReference`, `formula-evaluate.ts:265/371`, `preset.ts:820`) passes a scope id from `from`'s own scope path, and `scopeFieldsAt` returns `from`'s own row, section or tab before the id-only fallback. A shared parent/child id reaching the fallback is TASK-100.
- No test on the `place` from the root lookup — low, patched: `the root path places the root row` covers three layouts.
- No test for a root repeat section or root repeat tab after a nested row — low, patched: both shapes were red before the fix.
- No rendering regression — low, rejected: rendering resolves block scopes through `repeatSectionByPath` (`preset-section.tsx:304/942`), which the new tests cover; a component test adds no independent oracle.
- Empty path lost its guard — false: `repeatSectionByPath(layout, [])` and `repeatScopeByPath(layout, [])` both return `null` (run on a plain and a repeat tab).
- `section: PresetSection | undefined` in `repeatSectionPlaceByPath` — low, rejected: pre-existing type looseness with no wrong result.
- `RepeatScope` has no scope kind — low, rejected: a design refactor beyond this fix; the one kind check left is in `tokenCellPlaceAtPath`.
- Task and spec not closed — false as a code finding: closing happens after review.
- `tokenCellPlace` test checks indices only — low, rejected: the indices name the row; `liveLinkTarget` composes the two covered lookups.
