---
title: '4.1 Evaluate Dice Formulas Safely'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: '3d2585441e6705fe7ff71523c1ab16b8645713ce'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-10-keep-a-different-number-of-rows-per-character.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dice cells hold formulas that Story 1.5 parses into a tree, but nothing evaluates the tree, so no roll result can exist. Backlog task: TASK-24, whose seven acceptance criteria apply in full.

**Approach:** Add a pure evaluator in `core` that walks the 1.5 parse tree with an injected random source and a field lookup built on the 1.10 resolver, and returns either a roll result or an expected failure as a `Result`.

## Boundaries & Constraints

**Always:** Pure functions in `src/core`, no platform or UI import. Expected failures return `Result`; nothing throws for a bad formula, a bad field or bad arithmetic. The random source is a parameter. Field ids resolve through `resolveFieldReference` in `core/preset`. A `text` field counts only when `parseNumberInput` accepts its whole value as a number.

**Never:** `eval`, `new Function`, or any string-to-code path. UI, roll messages or notifications (Story 4.2). Changes to the 1.5 grammar.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Comparison | `1d20 <= str - 2*str_tired`, str 14, str_tired 2, die shows 7 | Roll 7 (faces `[7]`), target 10, outcome success | N/A |
| Comparison fails | Same, die shows 15 | Roll 15, target 10, outcome failure | N/A |
| No comparison | `2d6 + dex`, dex 3, faces 4 and 5 | Roll 12, no target, no outcome | N/A |
| Functions | `floor(str / 3)`, str 14 | 4; `ceil` gives 5 | N/A |
| Dice faces | `NdM` with a seeded source | Each face = `floor(random() * M) + 1`, in tree order, all reported | N/A |
| Check field | `1d20 + bless`, `bless` a `check` field | Checked counts 1; unchecked and no key both count 0 | N/A |
| Empty field | Referenced number or text field with no value | Error naming the field id | Result, no throw |
| Non-numeric text | Text field `abc` or `12abc` | Error naming the field id | Result, no throw |
| Numeric text | Text field `1,5` or ` 7 ` accepted by the 1.9 parser | Its number | N/A |
| Unknown id | Id not on the sheet, or removed by a preset change | Error naming the id | Result, no throw |
| Repeat scope | Id that exists only inside another repeat section, or a repeat field used from a non-repeat row | Error naming the id | Result, no throw |
| Same row first | Repeat row field and a sheet field share an id | The row's own value is used | N/A |
| Division by zero | `str / (dex - dex)` | Error with no field name | Result, no throw |
| Non-finite | Any step yields `Infinity` or `NaN` | Error with no field name | Result, no throw |

</frozen-after-approval>

## Code Map

- `src/core/formula.ts` -- parse tree types and `parseFormula` (1.5); the evaluator goes beside it, in `src/core/formula-evaluate.ts`.
- `src/core/preset.ts` -- `resolveFieldReference`, `TemplateRowPlace`, field cell types (1.10).
- `src/core/number-input.ts` -- `parseNumberInput` (1.9).
- `src/core/sheet-values.ts` -- how `row:` and `rep:` values are read for a sheet; `isChecked`.
- `.oxlintrc.json` or `oxlint.config.ts` -- lint rules.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/formula-evaluate.ts` -- `evaluateFormula(tree, lookup, random)` returning `Result<RollResult, EvaluationFailure>`; `RollResult` = `{ roll: number, faces: number[], target: number | null, outcome: 'success' | 'failure' | null }`; `EvaluationFailure` = `{ code: 'field', fieldId } | { code: 'arithmetic' }` -- AC 1, 2, 5, 6.
- [ ] Same module -- a lookup builder from a template, a row place, the sheet's values and the row instance's values, using `resolveFieldReference` and the referenced cell's field type -- AC 3, 4, 5.
- [ ] Lint config -- `no-eval`, `no-implied-eval` and `no-new-func` at error for the whole code base -- AC 7.
- [ ] `src/core/formula-evaluate.test.ts` -- one test per matrix row with a seeded source that shows exact arithmetic.

**Acceptance Criteria:** the seven criteria of TASK-24.

## Implementation Notes

## Spec Change Log

- Review: `RollResult.faces` mixed the dice of the roll side and the target side, so Story 4.2 could not show which dice made the roll. Amended shape: `{ roll, faces, target, targetFaces, outcome }`. `faces` holds the roll side's dice and `targetFaces` the target side's, each in tree order. `targetFaces` is `[]` with no comparison. Known-bad state avoided: a roll message that shows target dice as part of the roll.

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind and Verification: a second field of a grid row (record id differs from field id) is never read by a test | medium | Mutation `sheetRow(id)` stayed green. Patched with a `bonus` test. |
| Verification: non-finite check only tested at a side's top | low | Patched: `floor(1 / (big * big))`. |
| Blind and Verification: a `number` field holding a string shows but fails the roll | low | Patched: parsed like `text`; tests. |
| Edge and Blind: a random source outside [0, 1) gives faces outside [1, M] | low | Patched: faces clamped; tests. |
| Edge: finite values past the safe integer range accepted | low | Patched: arithmetic error; tests. |
| Edge and Blind: a non-repeat caller must build `ownRow` itself | low | Patched: derived when omitted; test. |
| Blind: `faces` mixes roll and target dice | low | Patched: `faces` and `targetFaces`; Spec Change Log. |
| Edge and Blind: comment says faces go with a failure | low | Patched. |
| Blind: failures in a target or a call untested; relative imports | low | Patched. |
| Blind: the resolver and the lookup search the template twice | low | Rejected: behavior is the same; a shape change to `resolveFieldReference` touches 1.10 callers. |
| Implementer: a number stored as exponent text (`1e-7`) is refused by the 1.9 parser | low | Deferred. |

## Design Notes

- The roll is the comparison's left side; the target is its right side. Dice on the target side roll too and their faces join `faces` in tree order. With no comparison the whole tree is the roll.
- Outcome is `success` when the comparison holds.
- Division is real division; only `floor` and `ceil` round. A result that is not an integer is still a valid roll.
- A failure in any step stops evaluation; dice already rolled are discarded with it.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.
