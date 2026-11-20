---
title: 'TASK-153: Suggest only readable fields in the Builder formula input'
type: 'bugfix'
created: '2026-11-20'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context: ['{project-root}/CLAUDE.md', '{project-root}/GLOSSARY.md']
baseline_commit: 'ff39caea7b00fc76596985cb2f14fd8f594efb9a'
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** A GM can choose a Builder formula suggestion for a field that the dice cell cannot read. The preset then has an unresolved field reference and cannot be downloaded.

**Approach:** In one GM's Builder window, offer only the field ids that TASK-152's preset validator can resolve from the dice cell's row. Offer fields in the dice cell's own block first, then enclosing blocks from nearest to farthest, then the sheet scope across plain tabs. Never offer an id owned only by a child or unrelated repeat block. A field can still have a type that does not fit the formula. Do not change formula grammar, type checks, or the preset format.

**Acceptance:** Given a plain dice cell beside a repeat row and a separate repeat tab, when the GM types the shared field id prefix, the list includes sheet fields on plain tabs and excludes repeat-only fields. Given a dice cell in a nested repeat, when the GM types that prefix, the list includes the local, enclosing, and sheet fields without fields from another branch. In the test preset, choosing a suggested numeric field leaves preset download available.

</frozen-after-approval>

## Implementation Notes

- `src/builder/document.ts` currently finds suggestions from a section without the row. Use the full row place from `CellForm` in `src/builder/item-form.tsx`.
- `src/core/preset.ts` already owns the repeat and sheet lookup. Reuse that lookup code in both completion and `resolveFieldReference`. Do not walk repeat scopes in Builder or run a separate template-wide reference search for every field on each edit.
- Keep the existing `FormulaInput` keyboard and prefix behavior. Assert the visible list and download state in `tests/builder.e2e.ts`. Keep the existing scope ordering test in `src/builder/document.test.ts`; pass it the relevant row.
- Format, lint, typecheck, Bun tests, build, and formal drift should take about two minutes. Allow two minutes for mutants on the committed tree and about twelve minutes for Chromium with one worker.
