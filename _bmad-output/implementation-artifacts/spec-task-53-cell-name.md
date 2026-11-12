---
title: 'TASK-53 Let a preset name a field and a dice cell, and show the name on hover'
type: 'feature'
created: '2026-11-12'
status: 'in-progress'
baseline_commit: 'cf8eab9e5aa3404689a53666abaac5729d3919e9'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-muster-roll/preset-format.md'
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-task-52-dice-choice-field.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A field is named by the nearest text cell before it in its row, else its id; a dice cell by that text cell, else its formula. Compact layouts break this: in `presets/cairn-2e.json` a screen reader says "weapon", "npc_name", "attack_1", reads STR current and maximum both as "STR", and hp_max as «из». Backlog task TASK-53; its seven acceptance criteria apply in full.

**Approach:** An optional cell name, key `name`, on a field (any type) and a dice cell: `{ "kind": "field", "type": "number", "id": "str_max", "name": "STR, максимум" }`. It becomes the cell's label everywhere the label is read, and a named cell shows it in a tooltip.

Decisions (owner said "работай автономно"; recorded in the spec, UX and architecture memlogs, commit cf8eab9):
- Format: `name` allowed on `field` and `dice` cells, not on `text`. Refused: blank (empty or spaces only) → `blank-name`; more than 60 characters (code points) → `long-name`. Path = the cell; the message names a field by its id and a dice cell by its formula (`shortDetail`).
- Label: `cellLabel` = name, else nearest preceding text cell with text, else id or formula. It feeds field `aria-label`s, read-only value names, the dice button's accessible name, the roll `{cell}` (with `Nd(id)`: «{name} ({written})», as for a label), `fieldLabel` in field errors, preview sample text.
- Dice button visible text stays the old rule (text cell, else formula); only its accessible name and tooltip take the name.
- Tooltip (named cells only, readers and writers): opens on hover after a short delay (≤ 500 ms) and at once on focus by keyboard or tap; closes when pointer and focus leave, and on `Esc`. Above the control, below when no room; never over it. Not announced twice: the name is the accessible name only. A named read-only value takes focus (tab stop); an unnamed one still does not. Look: DESIGN.md Tooltip row.
- Builder: field and dice forms gain «Название» with hint «Видно в подсказке. Пусто — ячейку называет подпись перед ней.»; typing sets `name`, an input with only spaces or nothing removes the key. One undo step per typing run. `toPreset` keeps `name` (after `id` for a field, after `formula` for a dice cell).
- Preset change: a name is structure only; values stay, the short notice shows.
- Cairn: names `weapon` «Оружие», `npc_name` «Имя NPC», `attack_1`/`attack_2` «Атака 1»/«Атака 2», `attack_1_die`/`attack_2_die` and their dice cells «Урон атаки 1»/«Урон атаки 2», `str_max`/`dex_max`/`wil_max` «STR, максимум» etc., both `hp_max` «HP, максимум».

## Boundaries & Constraints

**Always:** Russian copy in `src/ui/copy.ts`; react-aria for the tooltip where it fits (EXPERIENCE: "Components use react-aria"); focus outline and 32 px targets stay; the example parse test passes.

**Never:** changes in `src/replica/` (engine lane); editing GLOSSARY or anything under `_bmad-output/specs` or `_bmad-output/planning-artifacts` (done in cf8eab9); a tooltip on an unnamed cell; changing the dice button's visible text.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Named field | `str_max` with name «STR, максимум», text «STR» before | input accessible name «STR, максимум» | N/A |
| Unnamed field | `str`, text «STR» before | accessible name «STR», no tooltip | N/A |
| Named dice, no text before | `1d20 <= str`, name «Спасбросок STR» | button text `1d20 <= str`, accessible name and roll `{cell}` «Спасбросок STR» | N/A |
| Named dice with Nd(id) | name «Урон атаки 1», die d8 | `{cell}` «Урон атаки 1 (1d8)» | N/A |
| Field error by name | empty `hp_max` named «HP, максимум» in a formula | no roll | «Нельзя бросить: поле «HP, максимум» пустое или не число» |
| Blank name | field `hp` with `"name": "  "` | file refused | «пустое название у поля «hp»» |
| Blank dice name | dice `1d20` with `"name": ""` | file refused | «пустое название у кубика «1d20»» |
| Long name | 61 characters on field `hp` | file refused; 60 accepted | «название поля «hp» длиннее 60 символов» (dice: «название кубика «{formula}» длиннее 60 символов») |
| Name on text cell | `{ "kind": "text", "text": "x", "name": "y" }` | file refused | «неверная структура» |
| Tooltip by keyboard | Tab to a named field (writer) or named read-only value (reader) | tooltip with the name, control uncovered; `Esc` hides it | N/A |
| Builder clear | name input emptied | `name` key gone from the downloaded preset | N/A |

</frozen-after-approval>

## Code Map

- `src/core/preset.ts` -- `fieldCellSchema` members (~L21–36) and `diceCellSchema` (L38): add `name: z.string().optional()`. Failure codes `blank-name`, `long-name` with `detail` and `cell: 'field' | 'dice'`; checked in `cellFailure` (~L505) after the cell's own checks. Export the 60 limit (e.g. `CELL_NAME_MAX_CHARACTERS`).
- `src/core/sheet-values.ts` (`cellLabel` L73) -- name first. Add a function for the dice button's visible text without the name.
- `src/core/dice-roll.ts` (~L163, `fieldLabel` L235) -- reads `cellLabel`; the `cellText === cell.formula` test must not mistake a named cell; check the label rule with a name.
- `src/ui/preset-errors.ts`, `src/ui/copy.ts` (`badFileReason` ~L122, `builder.form` ~L240) -- four reasons, form label and hint.
- `src/ui/sheet/preset-cell.tsx` -- `CellContent` passes the name to every control; tooltip around `CheckField`, `SelectField`, `TextValueField`, `ReadOnlyValue` (tabIndex 0 when named) and the dice button. `src/ui/sheet/dice-button.tsx` -- separate `label` (visible) and accessible name. A shared tooltip primitive belongs in `src/ui/primitives/`. RAC 1.22.1 exports `TooltipTrigger`, `Tooltip`, `Focusable`; its trigger opens only on keyboard focus, so a tap needs its own focus handling.
- `src/preview/sample-records.ts` (~L176) -- reads `cellLabel`, no change expected.
- `src/builder/document.ts` (`cellToPreset` ~L140) -- carry `name`; `src/builder/item-form.tsx` (`CellForm` ~L451) -- name input for field and dice.
- `docs/preset-format.md` (Cell table, a "Cell names" subsection with the WCAG 2.5.3 advice to start a dice name with the button text, refusal table, preset-change row, Limits, annotated example), `docs/example-preset.json` (name `hp_max` «Хиты, максимум», `str_tired` «Сила: усталость», `dex_tired` «Ловкость: усталость»), `presets/cairn-2e.json`.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- add: Cairn inventory slots and fatigue checks read "1"…"10" (outside TASK-53's list).
- Tests: `preset.test.ts`, `sheet-values.test.ts`, `dice-roll.test.ts`, `preset-errors.test.ts`, builder `document.test.ts`; e2e: a new `tests/cell-name.e2e.ts` (accessible name, tooltip on hover and keyboard focus for writer and reader, `Esc`, not covering the control) and `tests/builder.e2e.ts` (set and clear).

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/preset.ts` + test -- schema, two rules -- AC #1, #4.
- [ ] `src/core/sheet-values.ts`, `src/core/dice-roll.ts` + tests -- label rule, roll label, field error -- AC #1, #2.
- [ ] `src/ui/copy.ts`, `src/ui/preset-errors.ts` + test -- reasons -- AC #4.
- [ ] `src/ui/primitives/*`, `src/ui/sheet/preset-cell.tsx`, `src/ui/sheet/dice-button.tsx` -- names and tooltip -- AC #1, #3.
- [ ] `src/builder/document.ts`, `src/builder/item-form.tsx` + tests -- AC #5.
- [ ] `docs/preset-format.md`, `docs/example-preset.json` -- AC #7.
- [ ] `presets/cairn-2e.json`, `deferred-work.md` -- AC #6.
- [ ] `tests/cell-name.e2e.ts`, `tests/builder.e2e.ts` -- browser proof of AC #1, #3, #5.

**Acceptance Criteria:**
- Given the example preset and `presets/cairn-2e.json`, when parsed, then both pass, and no Cairn field or dice cell has `cellLabel` equal to its id or «из» (`bun test src/core/preset.test.ts`).
- Given the Cairn preset on the mock, when a GM tabs to `str_max`, then its accessible name is «STR, максимум» and a tooltip with that text shows outside the input's box.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser` (outside the sandbox), `bun run build` -- all pass.

**Manual checks (if no CLI):**
- Owner, live room on a tablet and a laptop: a named field's tooltip shows on hover, on Tab and on tap, and does not hide the value being typed; VoiceOver reads «STR, максимум» once.
