---
title: 'TASK-87: Retire v3 cleanup paths'
type: 'chore'
created: '2026-11-17'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Format v4 uses explicit repeat scope ids, repeat `nameField` metadata, and token-cell targets. A few v3-era preparation paths, fallback helpers, duplicate exports, and comments still imply the retired first-field or linkable-sheet model. They add maintenance risk while no longer changing an accepted v4 result.

**Approach:** Remove only the unreachable preparation and unused helpers identified by TASK-87, update comments to describe the current model, and reuse behavioral owners to prove that values, ordering, null clears, explicit repeat names, token-cell identity, and offered labels remain unchanged.

## Boundaries & Constraints

**Always:** Preserve current v4 data and UI behavior. Keep migration writes, their order, null-clears, and current loss behavior unchanged. Repeat blocks continue to use the explicit `repeat.nameField`; token links continue to identify their token cell; picker targets retain their current offered ancestor labels. Reuse `LINK_PICKER_POPOVER_ID` rather than changing its value. Inspect every caller before deleting a parameter, helper, or export.

**Never:** Do not implement TASK-79, TASK-80, TASK-81, or TASK-82 candidates. Do not change the preset format, migration contract, token-link policy, picker output, or tests merely to assert source absence. Do not add a performance benchmark, redesign link resolution, or create a feature test for comments.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Preset reconciliation | A v4 repeat scope id remains or is removed | Existing block values and order survive only for the unchanged id; removed scope values retain the current loss/clear result | No relocation by matching fields |
| Repeat duplication and labels | A repeat uses an explicit `nameField`, including one after another field | Duplicate names and token-picker labels use that configured field | Empty/non-text names retain current outcomes |
| Token-cell picker | A GM opens the picker from a token cell | The existing popover id opens the same cell-target picker and labels stay unchanged | Existing command rejection handling remains |

</frozen-after-approval>

## Code Map

- `src/core/link-target.ts` -- `liveLinkTarget` still accepts and discards a default `BlockIndex`; remove the unread preparation and update each caller without changing live-target validation.
- `src/core/preset-migrate.ts` -- stable `sectionTarget` returns only the same id or `null`; remove the unreachable relocation sort/conflict preparation while retaining migration write ordering, loss accounting, clear writes, `presetMoves`, and helpers with consumers.
- `src/core/preset.ts` -- the review identified duplicate unused `isSheetSet` and `hasField` exports; confirm no current references before removal. The live `isSheetSet` in `src/core/sheets.ts` is not in scope.
- `src/core/repeat-block-duplicate.ts` and `src/core/sheets.ts` -- use explicit repeat `nameField` rather than first-field naming fallbacks; adjust only comments or unreachable v3 fallback code that current schema makes unnecessary.
- `src/core/token-links.ts`, `src/ui/picker/link-picker.tsx`, `src/ui/main.tsx`, and `src/core/link-target.ts` -- replace retired linkable-sheet/block wording with token-cell target wording and import the shared picker popover id in the token-cell opener.
- `src/core/{link-target,preset-migrate,repeat-block-duplicate,sheets,token-links}.test.ts`, `src/replica/engine-link.test.ts`, and `src/ui/picker/link-picker.test.tsx` -- existing behavioral owners for the preserved outcomes; no source-shape or absence test is valid.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/link-target.ts` and its callers -- remove the unused block-index parameter/default work while preserving live-link outputs.
- [ ] `src/core/preset-migrate.ts` -- remove only the dead v3 relocation preparation and its now-unused dependencies, retaining stable-id migration effects.
- [ ] `src/core/preset.ts`, `src/core/repeat-block-duplicate.ts`, and `src/core/sheets.ts` -- delete verified-unused v3 helpers/fallbacks and express explicit repeat-name semantics.
- [ ] `src/core/token-links.ts`, `src/ui/picker/link-picker.tsx`, and `src/ui/main.tsx` -- correct stale token/link comments and share the established picker popover id.
- [ ] Existing behavior owners and static checks -- run the checks-only route; add no source-absence assertion.

**Acceptance Criteria:**
- Given an unchanged or removed v4 repeat scope, when a preset is reconciled, then current values, orders, and null-clear behavior remain exactly as covered by the existing migration owner.
- Given an explicit repeat `nameField` and a token-cell target, when names, labels, and picker opening are exercised, then the current configured name, cell identity, and labels remain unchanged.
- Given the cleaned internals, when type, lint, format, unit, browser, and build checks run at the stable source state, then each passes without a new feature contract.

## Design Notes

`sectionTarget` is the boundary for the deletion: its v4 result is same-id or `null`, so a branch that prepares a distinct relocation target is unreachable. Preserve the surrounding deterministic record sort and existing emitted writes; removal must not simplify an observable migration path.

The cleanup has no independent new oracle. Existing public behavior owners cover migrations, repeat naming, token links, and picker behavior; comment-only changes are verified by review. The writer must not create a test that inspects removed source or a default parameter.

## Verification

**Commands:**
- Focused existing owners selected by the writer -- expected: exact preserved public outcomes and exit 0; approximately 2 minutes.
- `bunx oxfmt --ignore-path .gitignore --check .` -- expected: exit 0; approximately 1 minute.
- `bun run lint` -- expected: exit 0; approximately 1 minute.
- `bun run typecheck` -- expected: exit 0; approximately 1 minute.
- `bun test` -- expected: exit 0 with the project environment skip only; approximately 2 minutes.
- `bun run test:browser` -- expected: exit 0; approximately 4 minutes.
- `bun run build` -- expected: exit 0; approximately 1 minute.

## Implementation Notes

- 2026-11-17: TASK-79/80/81/82 blocked candidates are excluded. Investigation was verified against the actual branch base `e799aaed9c3c76044752b06d776d4e98a2f878e8`; the TASK-87 navigation note is `/Users/seigiard/.claude/artifacts/preset-v4-78-87-20261117/exploration.report.md`.
