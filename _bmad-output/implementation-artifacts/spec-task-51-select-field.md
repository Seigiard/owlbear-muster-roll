---
title: 'TASK-51 Add a select field type to presets'
type: 'feature'
created: '2026-11-12'
status: 'in-progress'
baseline_commit: '6f1901a1d25fcfb00c4d7221cab092357958ff19'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/preset-format.md'
  - '{project-root}/GLOSSARY.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A field holds only text, a number or a check. Values from a short fixed list (a class, an armour type, a condition) are typed by hand, so typos break formulas and players cannot see the allowed values. Backlog task: TASK-51, whose seven acceptance criteria apply in full. TASK-52 (a dice-choice field) builds on this field.

**Approach:** A fourth field type, `select`, with a required `options` list of strings: `{ "kind": "field", "type": "select", "id": "armor", "options": ["Нет", "Кожаная"] }`. The sheet shows a native `<select>` with those options; a pick saves at once through the existing `field-patch` command, as a check does. The value is the option string.

Decisions (owner said "работай автономно"; recorded, not asked):
- Options constrain the picker only. A stored value is any non-empty string, as for `text`, so a value a changed preset leaves outside the options still shows (as an extra disabled option) and is replaced by a pick.
- Changing only a select field's options keeps its values. A type change (`text` ↔ `select` included) still erases values, as the format's preset change table says.
- The picker always offers an empty choice «—», which clears the field, as an emptied text field does.
- Rule failures, each naming the field: no options, a blank option (empty or spaces only), a repeated option. A missing `options` key, or `options` on another type, is a structure error.
- A select field cannot be a sheet set's name field, and does not take a duplicate number (both stay `text` only).
- Cairn 2e gets no select now: its only list-valued field is the weapon's die, which TASK-52 turns into a dice-choice field.

## Boundaries & Constraints

**Always:** zod schema shape lets TASK-52 add another option-list type beside `select` (`fieldOptions` helper, option rules apply to any field with options). Interface text in `src/ui/copy.ts`. Accessibility Floor: keyboard, accessible name from the label (`cellLabel`), 32 px target, visible focus. Player picks go through the pending-edit path untouched.

**Never:** changes in `src/replica/` (the engine lane works there). Membership checks on patches. `eval`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pick | GM picks «Кожаная» | `row:` record holds `"Кожаная"`, all clients show it | N/A |
| Clear | pick «—» | the key leaves the record | N/A |
| Stale value | value «Латы», options lack it | picker shows «Латы» selected; a pick replaces it | N/A |
| Reader | player without write access | value as read-only text named by the label | N/A |
| No options | `options: []` | file refused | «у поля «{id}» нет вариантов» |
| Blank option | `options: ["", "a"]` | file refused | «пустой вариант в поле «{id}»» |
| Repeated option | `options: ["a", "a"]` | file refused | «вариант «{option}» повторяется в поле «{id}»» |
| Options change | upload keeps id and type, new options | values kept, no erase count | N/A |
| Type change | `text` → `select`, same id | values erased and counted | confirmation |

</frozen-after-approval>

## Code Map

- `src/core/preset.ts` -- `fieldCellSchema` (z.discriminatedUnion on `type`, nested in the `kind` union works in zod 4), `PresetFailure` codes, `cellFailure` rules; add `fieldOptions`.
- `src/core/field-patch.ts` -- `VALUE_SCHEMAS` keyed by type: `select` takes `z.string().min(1)`.
- `src/core/preset-migrate.ts` -- `planSheet` (row values, ~L340-360) and `planRepeatRows` (`newFields`) keep a value by value type only; add a same-type check so `text`↔`select` erases.
- `src/core/snapshot-import.ts` -- `FIELD_TYPES` (~L63) builds field cells from guessed types; narrow its annotation to text/number/check.
- `src/core/preset-migrate.ts` detail -- `planSheet` ~L356: also require old and new field type to match; `planRepeatRows`: filter `newFields` to fields whose id and type match an old field (`keptValues` and the retry check both read it). `sectionTarget` already compares types.
- Already text-only, no change: `nameFieldFailure` (preset.ts), `src/core/repeat-block-duplicate.ts:46`. `formula-evaluate.ts` reads a select value as text.
- `useSelectFieldEdit` -- model on `useCheckFieldEdit` (`use-field-edit.ts` ~L375): `useShownValue` + `shown.hold`; a pick of `''` sends `null`; a pick equal to the shown value sends nothing.
- Keyboard e2e: on macOS headless Chromium, arrow keys on a focused `<select>` may open the popup; prefer `selectOption` after focusing by Tab, plus a check that Tab reaches it and its accessible name.
- `src/ui/preset-errors.ts`, `src/ui/copy.ts` -- reasons for the three new codes; sheet and builder copy.
- `src/ui/sheet/preset-cell.tsx` -- add `SelectField` beside `CheckField`; `ReadOnlyValue` already shows strings.
- `src/ui/sheet/use-field-edit.ts` -- add `useSelectFieldEdit`, modelled on `useCheckFieldEdit` (held value until the projection returns).
- `src/preview/sample-records.ts` -- sample value for a select.
- `src/builder/item-form.tsx`, `src/builder/document.ts`, `src/builder/structure-tree.tsx` -- type option «Список», options textarea (one per line), type switch adds or drops `options`, tree label.
- `docs/preset-format.md`, `docs/example-preset.json`, `_bmad-output/specs/spec-muster-roll/preset-format.md` (via memlog), `GLOSSARY.md`, EXPERIENCE.md, ARCHITECTURE-SPINE.md (value types) -- docs.
- Tests: `src/core/preset.test.ts`, `field-patch.test.ts`, `preset-migrate.test.ts`, `src/builder/document.test.ts`, new `tests/select-field.e2e.ts`, `tests/builder.e2e.ts`.

## Copy

Exact Russian strings for `src/ui/copy.ts`: builder field type «Список»; builder options input label «Варианты — по одному в строке» (a textarea, one option per line; blank lines are not stored; each line is trimmed; keep the raw text locally while typing so Enter can add a line); default options when the type switches to select «Вариант 1», «Вариант 2» (switching away drops `options`); sheet picker empty choice «—»; refusal reasons «у поля «{id}» нет вариантов», «пустой вариант в поле «{id}»», «вариант «{option}» повторяется в поле «{id}»». `GLOSSARY.md`, EXPERIENCE.md and the spec copy already describe this.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/preset.ts` + test -- schema, `fieldOptions`, rules `no-options`, `blank-option`, `duplicate-option` with field detail -- AC #2.
- [ ] `src/core/field-patch.ts`, `preset-migrate.ts`, `snapshot-import.ts` + tests -- select value type; same-type rule on migration -- AC #3, #4.
- [ ] `src/ui/copy.ts`, `preset-errors.ts` -- messages -- AC #2.
- [ ] `src/ui/sheet/*` -- `SelectField`, `useSelectFieldEdit` -- AC #1, #3, #4, #5.
- [ ] `src/preview/sample-records.ts` -- sample value.
- [ ] `src/builder/*` + tests -- type «Список», options editing -- AC #6.
- [ ] `docs/preset-format.md`, `docs/example-preset.json` (add one select field, e.g. armour in the `pc` template) -- AC #7. `GLOSSARY.md` and everything under `_bmad-output/planning-artifacts` and `_bmad-output/specs` are changed by the main session through their memlogs: do not edit them.
- [ ] `tests/select-field.e2e.ts`, `tests/builder.e2e.ts` -- GM pick, clear, stale value, player with and without access, keyboard, name, 32 px; builder adds a select field and edits its options.

**Acceptance Criteria:**
- Given the example preset with a select field, when parsed, then it passes (`bun test src/core/preset.test.ts`).
- Given a select field focused by Tab, when the arrow keys change the option, then the value saves and every client shows it.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser` (outside the sandbox), `bun run build` -- all pass.

**Manual checks (if no CLI):**
- Owner, live room: a player with write access picks an option and the GM's window shows it; the native picker looks right in both Owlbear themes.
