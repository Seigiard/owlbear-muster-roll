---
title: 'TASK-52 Let a formula roll the die a dice-choice field holds'
type: 'feature'
created: '2026-11-12'
status: 'in-progress'
baseline_commit: '283a33e1c7f5579ce417bc0d3d7efc4aa02c5abb'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-muster-roll/preset-format.md'
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-task-51-select-field.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A dice term needs a literal size (`1d8`), so a weapon's damage die cannot come from its repeat block. The Cairn preset shows five fixed cells, d4 to d12, per attack row. Backlog task TASK-52; its seven acceptance criteria apply in full.

**Approach:** A field type `dice-choice` is a select field (TASK-51) whose options are die sizes: `{ "kind": "field", "type": "dice-choice", "id": "weapon_die", "options": ["d6", "d8", "d10"] }`. A formula rolls the chosen die with `Nd(id)`, such as `1d(weapon_die) + bonus`. Before a roll lists its dice terms or evaluates, each `Nd(id)` is resolved to a literal `NdM` from the field's value, so the evaluator, the faces and the dice extension see only literal dice.

Decisions (owner said "работай автономно"; recorded in the spec, UX and architecture memlogs, commit 999e137):
- Options: `d` and an integer 1–1000, no leading zero (`d4`, `d100`). The select rules (no options, blank, repeated) apply too; a new rule refuses any other option, naming the field and the option. Value, picker, «—», stale value, reader view: as select.
- `Nd(id)`: literal `N` 1–100 (as `NdM`), `d` or `D`, then `(`, a field id with optional spaces around it, `)`. Anything else in the parentheses is a syntax error.
- Preset check per dice cell, path = the dice cell: an id resolving (as `resolveFieldReference` does, from the cell's row) to a `dice-choice` field outside `Nd(...)`, or an `Nd(...)` id resolving to a field of another type, is refused. An id resolving to no field stays a roll-time error.
- Roll: an empty value, a value that is not `d`+integer 1–1000, or a die slot whose id resolves to no field or to a non-`dice-choice` field, gives the field error naming the field. The die is read from the values the roll is prepared with (shown values over records).
- Roll `{cell}`: formula with no `Nd(id)` — unchanged. Cell labelled by its formula — the formula text with each `Nd(id)` written as `NdM` (`1d8 + bonus`). Cell labelled by a text cell — `{text} ({written-out formula})` (`Урон (1d8)`). The sheet's dice button keeps `cellLabel`.
- Builder: type «Выбор кубика», same options textarea; switching to it starts with d4, d6, d8, d10, d12, d20. Rename rewrites an id inside `Nd(...)`.
- Not a name field, no duplicate number; select ↔ dice-choice is a type change (erases); options-only change keeps values; snapshot import matches a guessed `text` field to a current `dice-choice` field as it does for `select`.
- Cairn: each weapon and NPC attack row is [name text][«Урон» text][die field d4…d12][dice `1d(…)`]. Impaired and enhanced attacks stay expressible: the player picks d4 or d12 in the field.

## Boundaries & Constraints

**Always:** formulas only through `src/core/formula.ts`; Russian copy in `src/ui/copy.ts`; the select field's accessibility (label name, keyboard, 32 px, focus) holds for dice-choice.

**Never:** changes in `src/replica/` (engine lane); `eval`; membership checks on patches; editing GLOSSARY or anything under `_bmad-output/specs` or `_bmad-output/planning-artifacts` (done in 999e137).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Roll chosen die | `1d(weapon_die) + bonus`, die `d8`, bonus 2 | one d8 face + 2; dice extension notation `1d8` | N/A |
| Count | `2d(weapon_die)`, die `d6` | two d6 faces | N/A |
| No die chosen | die field empty | no roll | «Нельзя бросить: поле «{label}» пустое или не число» |
| Stale non-die value | value `Меч` | no roll | same field error |
| Bad option | `options: ["d8", "8"]` | file refused | «вариант «8» в поле «{id}» не кубик вида d6» |
| Die as number | `1d20 + weapon_die` | file refused | «в формуле «{formula}» поле «{id}» — выбор кубика, бросайте его как 1d({id})» |
| Number as die | `1d(bonus)`, bonus a number field | file refused | «в формуле «{formula}» поле «{id}» не выбор кубика» |
| Unknown id in slot | `1d(nothing)` | file accepted | field error at roll |
| Bad slot | `1d(2)`, `1d()`, `1d(a+b)` | file refused | «ошибка в формуле «{formula}»» |
| Roll label | text «Урон» before `1d(weapon_die)` | `{cell}` = «Урон (1d8)» | N/A |
| Formula label | no text before `1d(weapon_die) + bonus` | `{cell}` = «1d8 + bonus» | N/A |

</frozen-after-approval>

## Code Map

- `src/core/formula.ts` -- tokenizer and `FormulaExpression`: add a node `{ kind: 'dice-field', count, id }` for `Nd(id)`. `DICE_COUNT_MAX` applies.
- `src/core/formula-evaluate.ts` -- add a die-size lookup beside `formulaFieldLookup` (same scope rule, requires `type === 'dice-choice'`) and a resolve step tree → tree with only literal dice; `formulaDiceTerms`/`evaluateFormula` take resolved trees (`satisfies never` switches will flag the new node).
- `src/core/dice-roll.ts` -- `prepareDiceRoll` resolves before `formulaDiceTerms`; a resolve failure is `{ code: 'field', field: fieldLabel(...) }`; builds the roll `cell` per the label rule. The engine reads only `cell`, `terms`, `roll` (src/replica/engine.ts ~L2043, ~L4194) — no engine change.
- `src/core/preset.ts` -- schema member with `...fieldOptions`; rule codes `bad-die-option` (detail option, field), `die-field-as-number` and `field-not-die` (detail formula, field); option rules run for both list types; type check needs the whole template (field may come after the dice cell; repeat cells resolve outer fields), so run it as a template pass after `sectionsProblems`.
- `src/core/field-patch.ts` (`VALUE_SCHEMAS`), `src/core/preset-migrate.ts` (~L657 `allowTextForSelect`), `src/core/snapshot-import.ts` (~L63 `SnapshotFieldType`), `src/core/formula-rename.ts` -- value type, same-type rule, import match, rename inside `Nd(...)`.
- `src/ui/preset-errors.ts`, `src/ui/copy.ts` -- three reasons; builder `typeDiceChoice` «Выбор кубика».
- `src/ui/sheet/preset-cell.tsx` (~L140, ~L204) -- `SelectField` serves both list types.
- `src/preview/sample-records.ts` (~L172) -- sample value = first option.
- `src/builder/document.ts` (~L140–170), `src/builder/item-form.tsx` (~L515–540), `src/builder/structure-tree.tsx` -- type option, defaults, options input, tree label.
- `docs/preset-format.md` (shape, cell table, dice-choice rules, formula grammar and bullets, refusal table, preset-change row, annotated example), `docs/example-preset.json` (add a second row to «Атаки»: «Урон», `damage_die`, `1d(damage_die) + bonus`), `presets/cairn-2e.json`, `presets/README.md` (drop the five-dice note), `_bmad-output/implementation-artifacts/deferred-work.md` (~L181: add `status: resolved by spec-task-52 (TASK-52)`).
- Tests: `formula.test.ts`, `formula-evaluate.test.ts`, `dice-roll.test.ts`, `dice-plus.test.ts`, `preset.test.ts` (shipped presets resolve their ids), `formula-rename.test.ts`, `field-patch`, `preset-migrate`, `snapshot-import`, builder `document.test.ts`; e2e `tests/dice-choice-field.e2e.ts` (pick, roll with the chosen die, empty-field message), `tests/builder.e2e.ts`.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/formula.ts`, `formula-evaluate.ts`, `dice-roll.ts` + tests -- parse, resolve, roll, label -- AC #2, #3, #5.
- [ ] `src/core/preset.ts` + test -- schema, option rule, formula type check -- AC #1, #4.
- [ ] `field-patch`, `preset-migrate`, `snapshot-import`, `formula-rename` + tests -- value type, migration, import, rename.
- [ ] `src/ui/copy.ts`, `preset-errors.ts`, `src/ui/sheet/preset-cell.tsx`, `src/preview/sample-records.ts` -- picker and messages -- AC #1, #4.
- [ ] `src/builder/*` + tests -- «Выбор кубика».
- [ ] `docs/preset-format.md`, `docs/example-preset.json` -- AC #7.
- [ ] `presets/cairn-2e.json`, `presets/README.md`, `deferred-work.md` -- AC #6.
- [ ] `tests/dice-choice-field.e2e.ts`, `tests/builder.e2e.ts` -- browser proof.

**Acceptance Criteria:**
- Given the example preset and `presets/cairn-2e.json`, when parsed, then both pass and every formula id resolves (`bun test src/core/preset.test.ts`).
- Given a GM picks `d8` and presses the damage cell on the mock, then the roll notification names `1d8` and the roll uses one d8 face.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser` (outside the sandbox), `bun run build` -- all pass.

**Manual checks (if no CLI):**
- Owner, live room: with Dice+/dicex, the damage cell rolls a 3D d8 after picking d8; the notification reads «… Урон (1d8) — n».
