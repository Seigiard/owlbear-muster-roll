---
title: '1.8 See a Sheet Laid Out by the Preset'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: '37820783a532375578f99c3665a34a28ac0f087a'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/specs/spec-muster-roll/preset-format.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A character tab shows only its header, so the preset has no visible effect and no system fits yet. Backlog task: TASK-10, whose five acceptance criteria apply in full.

**Approach:** Render the character template under the header, with sections, widths, grids, inline rows, repeat instances and cells, and with each field's stored value shown read-only until Story 1.9.

## Boundaries & Constraints

**Always:** The preset alone decides content and arrangement. Values come from the projection: `row:{sheetId}:{rowId}` and `rep:{sheetId}:{sectionId}:{instanceId}`. Colors and type come from the existing tokens. The renderer takes a template, so Story 1.11 reuses it for the NPC template.

**Never:** Edit values (Story 1.9), add or remove repeat rows (1.10), roll dice (Epic 3), render NPCs (1.11), change section widths, or add color coding for game concepts.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Grid | Section with `columns: 3`, rows of 3 and 2 cells | One grid; cells of each column align across rows; the short row leaves its last cell empty | N/A |
| Grid overflow | Grid wider than the section | The section scrolls horizontally; the page does not | N/A |
| Inline | Section with no `columns` | Each row's cells flow inline and wrap | N/A |
| Widths | Sections `1/3`, `1/3`, `1/3`, `1/2`, `full`, none | Three in one line, then `1/2`, then `full`, then the default `full`; whole blocks wrap | N/A |
| Narrow | Content area below 480 px | Every section takes the full width | N/A |
| Text cell | `{ kind: 'text' }` | Its label | N/A |
| Field values | Stored `text`, `number`, `check` values in `row:` records | Shown in the field; `check` shows checked for `true` | N/A |
| Empty field | No key | An empty value area | N/A |
| Dice cell | Preceded by a text cell in its row; not preceded | Static label: that text; otherwise its formula | N/A |
| Field name | Field after a text cell; first in its row | Accessible name is that text; otherwise its id | N/A |
| Repeat | `repeat` section with `rep:` records for this sheet and for another sheet | This sheet's instances in `(order, instanceId)` order; none of the other sheet's | N/A |
| Stripes | Rows 1 to 4 of a section | Rows 2 and 4 use `surface-stripe` | N/A |
| Section style | Section with `title` | Heading in `section-heading` and `accent`; left rule in `line` | N/A |
| Value style | Field value | Dotted underline in `line-strong`; row at least 32 px high | N/A |
| Focus | Tab from the header | Read-only values take no focus | N/A |

</frozen-after-approval>

## Code Map

- `src/core/preset.ts` -- `Preset`, `PresetTemplate`, `PresetSection`, `PresetCell` types; repeat `sectionId` is the first field id of the template row.
- `src/core/records.ts`, `src/core/sheets.ts` -- record schemas and sheet helpers.
- `src/ui/main.tsx` -- decodes the preset and renders `CharacterHeader` as a character tab's content.
- `src/ui/main.css` -- tokens `surface-stripe`, `accent`, `line`, `line-strong`, `text-section-heading`, `touch-target`.
- `docs/example-preset.json` -- a preset with every cell kind and layout.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/sheet-values.ts` -- pure lookup of row values and ordered repeat instances for one sheet; label and accessible name resolution -- AC 4.
- [x] `src/ui/sheet/sheet-body.tsx`, `src/ui/sheet/preset-section.tsx`, `src/ui/sheet/preset-cell.tsx` -- the renderer -- AC 1 to 5.
- [x] `src/ui/main.tsx` -- character tab content is the header, then the body from the character template -- AC 1.
- [x] Tests: `src/core/sheet-values.test.ts`; `tests/sheet-layout.e2e.ts` with real background and window pages and a seeded preset and records -- every matrix row.

**Acceptance Criteria:** the five criteria of TASK-10.

## Implementation Notes

- `core/records.ts` now exports `fieldValuesSchema`, `repDataSchema` and the `FieldValue` type, so `core/sheet-values.ts` parses `row:` and `rep:` data with the same schemas the store uses. `firstFieldId` lives in `core/preset` and serves both the repeat check at upload and the value lookup.
- `cellLabel(cell, before)`: a `text` cell shows its text. A field or dice cell takes the nearest preceding `text` cell whose trimmed text is not empty, otherwise its id or formula. A blank `title` counts as no title (`sectionTitle`).
- A `text` or `number` value is a `div` with `role="textbox"`, `aria-readonly` and `whitespace-pre-wrap`, and no `tabIndex`, so it takes no focus at all. A `check` value is a native checkbox with `tabIndex={-1}`. Its click calls `preventDefault`, so it neither toggles nor fires a change event.
- Deviation from Design Notes: the `div` textbox takes no `tabIndex`, because `-1` lets a click focus it.
- In Chrome, a grid section that overflows has a keyboard-focusable scroller (`data-section-body`). It is the one Tab stop inside the sheet body, and keyboard users need it to scroll.
- Rows are keyed by `rowId` or `instanceId`, and cells by field id. Both fall back to `#index`.
- The dotted underline is on `text` and `number` values only. A checkbox has none.
- The `@container` sits on the sheet body wrapper, so the 480 px threshold is measured inside the content area's padding.
- Stripes come from the row index, not from `:nth-child`.
- Test hooks: `data-sheet-body`, `data-section`, `data-section-body`, `data-row`. The e2e room helpers live in `tests/support/room.ts`.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind and Verification: `tabIndex={-1}` makes a value focusable by click | medium | Confirmed by HTML rules. Patched: no `tabIndex` on the value `div`. |
| Blind: Tab test reads only `aria-readonly` | medium | False green. Patched to check where focus lands; observed red. |
| Blind and Edge: blank text cell gives an empty name; blank title an empty heading | medium | Confirmed: the schema allows blank strings. Patched with trim checks and unit tests. |
| Edge: very large or small numbers show in exponent form | low | Rare, and a number formatter adds surface. Rejected. |
| Blind: no test that a read-only checkbox keeps its state | low | Patched with an e2e test and an accurate comment. |
| Blind: wide grid cannot be scrolled from the keyboard in Safari | low | Chrome and Firefox focus the scroller. Rejected. |
| Blind: e2e helpers copied a fourth time | low | Patched: `tests/support/room.ts`. |
| Blind: locators bound to a Tailwind class and DOM shape | low | Patched with `data-*` hooks. |
| Blind: first-field rule written twice | low | Direct correction. Patched: one `firstFieldId` in `core/preset`. |
| Blind: empty repeat section untested | low | Patched with an e2e case. |
| Blind: repeat instances not grouped for screen readers | low | The spec fixes naming by id. Rejected. |
| Blind: dice label repeats the text before it | false | AC 4 sets this rule. Listed for the owner as a possible change. |
| Blind: index keys would move Story 1.9 edit state | medium | Confirmed by reading. Patched: keys from row, instance and field ids. |
| Blind: every record change recomputes all sections | low | Acceptable at this scale. Rejected. |
| Verification: `aria-multiline` unasserted | low | Deferred as filed to Story 1.9, which replaces these controls. |

## Design Notes

- Each field renders as the control Story 1.9 will make editable, read-only now: `text` and `number` as a read-only textbox, `check` as a checkbox with `aria-readonly`. Each takes `tabIndex={-1}` and has the resolved accessible name. A `text` value keeps its line breaks. A stored value of the wrong type shows as text; for `check`, anything but `true` is unchecked.
- Value lookup: a non-repeat field reads `row:{sheetId}:{rowId}`, where `rowId` is the first field id of its row. A repeat field reads `cells[fieldId]` of each `rep:{sheetId}:{sectionId}:{instanceId}`. Tombstones count as absent. The key prefix ends with `:`, so sheet `a` never reads sheet `ab`.
- Label resolution looks only at cells before the cell in the same row: the nearest `text` cell wins.
- Grid: the section body is a grid of `columns` tracks sized to content; each row spans all tracks as a `subgrid`, so its background can stripe and its cells align. The grid has at least the section's width and scrolls inside the section when wider.
- Widths: sections sit in a wrapping flex container. `1/3` and `1/2` take that share of the line minus the gaps; `full` and no width take the whole line. A container query on the content area makes every section full width below 480 px.
- Rows count from 1 inside a section, so rows 2, 4, … stripe. Repeat instances count the same way.
- A section with no `title` has no heading but keeps the left rule. A titled section is a `section` labelled by an `h2`.
- Gaps: `spacing.1` inside a row, `spacing.2` between controls, `spacing.4` between sections.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, after a deploy: load `docs/example-preset.json` in a live room, create a character, check the layout in the Owlbear light and dark themes.
