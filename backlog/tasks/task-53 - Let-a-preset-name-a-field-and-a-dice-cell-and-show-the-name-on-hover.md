---
id: TASK-53
title: Let a preset name a field and a dice cell, and show the name on hover
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T02:18:00Z'
updated_date: '2026-11-12T07:10:00Z'
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
- [ ] #1 A field cell and a dice cell in a preset may carry an optional name; when present, it is the accessible name of the control and the label of the roll, in place of the text cell before it
- [ ] #2 A cell without a name keeps the current rule: the nearest text cell before it in its row, else the field id or the formula
- [ ] #3 Hovering or focusing a named field or dice cell shows its name in a tooltip, for readers and writers alike; the tooltip does not cover the value being edited and works by keyboard
- [ ] #4 The preset check refuses a blank name and one longer than the limit the format sets, and names the cell
- [ ] #5 The preset builder can set and clear the name of a field or dice cell
- [ ] #6 presets/cairn-2e.json names weapon, npc_name, attack_1, attack_2, the maximum STR, DEX and WIL fields and hp_max, so no control there is named by its id or by «из»
- [ ] #7 docs/preset-format.md, the spec copy of the format and docs/example-preset.json describe the name; the example parse test passes
<!-- AC:END -->
