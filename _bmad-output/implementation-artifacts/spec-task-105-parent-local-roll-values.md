---
title: 'TASK-105: local values of enclosing blocks reach a child roll'
type: 'bugfix'
created: '2026-11-20'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `shownForRoll` (`src/ui/sheet/local-field-values.ts`) sends a roll only the local values of the rolled row's own record and of plain rows. A dice cell in a nested repeat block whose formula names a field of an enclosing (parent) block never gets that field's local value, so an input error in the parent field does not stop the child roll with a field error.

**Approach:** Pick each local value by the field the formula resolver would read. For each local value, resolve its field id from the rolled row with `resolveFieldReference` (`src/core/preset.ts`, import only): a block reference names the rolled block's ancestor at that scope depth, a sheet reference names the plain row. The value goes into `shown` only when its target is exactly that record. The dice button gets the template layout through `DiceSheetContext`. No change to `src/core/preset.ts` or `src/core/formula-evaluate.ts`.

</frozen-after-approval>

## Implementation Notes

- `shownForRoll(values, layout, row)` now resolves each local value's field id from the rolled row with `resolveFieldReference` and keeps the value only when its target is exactly the resolved record: the ancestor block at the reference's scope depth (a prefix of the rolled block's path), or the plain row. This mirrors `formulaFieldLookup` / `blockValuesAtScope` in core, so shadowing (own block over enclosing block over plain rows) follows the resolver instead of a separate `ownFieldIds` rule.
- `DiceRow` is now `RolledRow & { sheetId }`; its `target` and `fieldIds` were only read by `shownForRoll` and are gone. `DiceSheet` carries `layout` (the sheet's template) from `SheetBody`.
- Files: `src/ui/sheet/local-field-values.ts`, `dice-button.tsx`, `preset-section.tsx`, `sheet-body.tsx`, `local-field-values.test.ts`. No change to `src/core/`.
- Surprise: a fixture formula `d20 + …` does not parse (the grammar needs `1d20`), and the core reports that as `arithmetic`.
- Review patches: `fieldSource` takes the default scope depth from `repeatScopePathAt(layout, from)`, as `formulaFieldLookup` does, and returns `null` when a reference names a scope deeper than the rolled block. `RolledRow` is `Omit<TemplateRowPlace, 'path'> & { block }`; the resolver does not read `path`, so it is not passed.
- New e2e twin in `tests/repeat-tab-dice.e2e.ts`: an input error in the NPC tab's `Хиты` stops a roll in its nested `attack` block with the field error and sends nothing.

## Review Triage Log

- Duplicated-child regression test missing — low, patch: added a test that `claw:c1` under `n2` and sibling `claw:c2` do not reach the `n1/claw/c1` roll.
- Fixture lacks other nesting shapes — low, patch for the repeat-tab plain row (the default-depth path); rejected for the row-repeat shape (the resolver owns that branch and `fieldSource` only reads its `scopePath`) and for `Nd(field)` (the core overlays the same `shown` map on both lookups; no UI branch).
- `fieldSource` duplicates core ancestor selection — low, partly patched: the default depth now comes from `repeatScopePathAt` like the core. Rejected the shared core helper: it adds public API in `src/core/` for two call sites that agree today, and the unit and e2e tests now fail if the overlay misses the parent.
- Dead `block === null` branch / silent over-depth slice — low, patch: explicit depth check returns `null`; the remaining `null` check narrows the type.
- No e2e for the UI wiring — medium, patch: nested e2e twin added.
- Old spec 4-2 describes the two-level rule — false for this change: it is a done historical spec; the current rule is recorded in these notes and in the `shownForRoll` comment.
- Spec and task not closed — false at review time: closed in finalization.
- `RolledRow` re-declares `rowIndex`; `path` misleads — low, patch: type built from `TemplateRowPlace`, `path` dropped.
