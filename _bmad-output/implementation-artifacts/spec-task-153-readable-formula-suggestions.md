---
title: 'TASK-153: Suggest only readable fields in the Builder formula input'
type: 'bugfix'
created: '2026-11-20'
status: 'done'
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
- Builder completion and preset validation now use the same ordered lookup. The Builder supplies the selected row's position. The lookup keeps the nearest block first and the sheet last.
- Builder moves can leave repeat id conflicts in a draft. The lookup uses the selected row's physical ancestry, not the first section with a matching repeat id. The Builder still reports those conflicts and blocks download.

## Review Triage Log

- The first review identified two cases that violate the completion rule after a move. Both reproduced against the Builder document and are fixed. The new Bun tests failed on the wrong lists before the fix and passed after it.
- The first review also noted allocations in an artificial large-preset case. It did not establish a user-visible slowdown. No performance change was made for that case.
- Both reviewers reported no findings in the confirming review.

## Verification

- On `8039eaca66fa25da67d23c9fb3994b202aa7bcb6`, format, lint, typecheck, build, and formal drift passed. Bun reported 3,695 passes and one skip. All 55 mutants were killed. The comparison against the TASK-152 resolver matched all 2,396 lookups on shipped presets.
- The initial full Chromium run at `2184de0556f7e4a166baca4a406b317c56a97dfd` reported 597 passes and one timeout. The unrelated snapshot-clear test waited for the Snapshot file menu before reaching its assertions. The exact failed test passed on a traced repeat during the source change. The entire Builder file passed 38 of 38 on the clean final source commit. These repeats do not make the initial full run green or prove the timeout's cause.
- The final full `bun run test:browser --workers=1` passed all 598 tests at `8039eaca66fa25da67d23c9fb3994b202aa7bcb6`. Only Markdown notes changed while that run was active.
