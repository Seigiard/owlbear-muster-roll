---
id: TASK-53
title: Let a preset name a field and a dice cell, and show the name on hover
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T02:18:00Z'
updated_date: '2026-11-12T10:14:00Z'
labels:
  - v2
dependencies: []
references:
  - src/core/sheet-values.ts
  - presets/cairn-2e.json
  - docs/preset-format.md
type: feature
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A field takes its accessible name from the nearest text cell before it in its row, else from its field id; a dice cell takes the same text cell, else its formula. A compact layout breaks this. In presets/cairn-2e.json a screen reader says "weapon", "npc_name", "attack_1" and "attack_2"; the current and maximum STR, DEX and WIL fields both read "STR", because the column headers sit in another row; and hp_max reads «из». A visible text cell before each field would fix the names but costs columns and changes the layout. An optional name on the cell itself fixes it for every preset, and showing that name on hover also tells sighted users what an unlabelled field or die is for.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A field cell and a dice cell in a preset may carry an optional name; when present, it is the accessible name of the control and the label of the roll, in place of the text cell before it
- [x] #2 A cell without a name keeps the current rule: the nearest text cell before it in its row, else the field id or the formula
- [ ] #3 Hovering or focusing a named field or dice cell shows its name in a tooltip, for readers and writers alike; the tooltip does not cover the value being edited and works by keyboard
- [x] #4 The preset check refuses a blank name and one longer than the limit the format sets, and names the cell
- [x] #5 The preset builder can set and clear the name of a field or dice cell
- [x] #6 presets/cairn-2e.json names weapon, npc_name, attack_1, attack_2, the maximum STR, DEX and WIL fields and hp_max, so no control there is named by its id or by «из»
- [x] #7 docs/preset-format.md, the spec copy of the format and docs/example-preset.json describe the name; the example parse test passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Build through bmad-build: spec _bmad-output/implementation-artifacts/spec-task-53-cell-name.md (decisions in the spec, UX and architecture memlogs, commit cf8eab9). 1. Format: optional name on field and dice cells; blank and >60 characters refused, naming the cell. 2. cellLabel takes the name first; roll label, field errors and accessible names follow; dice button keeps its visible text. 3. Tooltip on named cells: hover, keyboard focus and tap; Esc closes; never over the control; named read-only values take focus. 4. Builder: Название input sets and clears the name. 5. Docs, example preset, Cairn names. 6. implement skill (tdd chain + code-review), then the full check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence on tip after merging master 49a427b: bun test 2646 pass (preset.test: name accepted on every field type and dice, refused on text, blank-name/long-name, 60 code points accepted; sheet-values and dice-roll tests: name first, unnamed rule kept, Nd(id) label «Урон атаки 1 (1d8)», field error names «HP, максимум»; preset-errors.test: the four reasons; document.test: builder keeps and drops name; example and Cairn parse tests). bun run test:browser 492 pass (tests/cell-name.e2e.ts: accessible names, tooltip on Tab, hover, click, touch tap with and without focus, Esc, outside tap, no overlap, read-only tab stop, unnamed cells unchanged; tests/builder.e2e.ts: set and clear «Название»). oxfmt, lint, typecheck, build exit 0. AC #3 is proved on the mock in Chromium only; it stays open for the owner's live check: tooltip placement inside the Owlbear window, a tablet tap (iOS Safari), VoiceOver reading «STR, максимум» once. Deferred: Cairn inventory slots and fatigue checks still read 1-10 (deferred-work.md). Code-review: 4 revmux rounds, last one clean. Branch worktree-agent-adf834099dae67f03, not merged.
<!-- SECTION:NOTES:END -->
