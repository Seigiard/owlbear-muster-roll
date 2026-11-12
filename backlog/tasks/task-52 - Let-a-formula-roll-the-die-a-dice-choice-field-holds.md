---
id: TASK-52
title: Let a formula roll the die a dice-choice field holds
status: To Do
assignee: []
created_date: '2026-11-12T02:15:00Z'
labels:
  - v2
dependencies:
  - TASK-51
references:
  - src/core/formula.ts
  - presets/cairn-2e.json
  - _bmad-output/implementation-artifacts/deferred-work.md
type: feature
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A formula needs literal dice sizes (`1d8`), so a die cannot come from a field. In Cairn 2e every weapon has its own damage die (d6, d8, d10), an impaired attack rolls d4 and an enhanced one d12. The Cairn preset (TASK-44) therefore shows five fixed dice cells, d4 to d12, on every attack row, and the player has to remember which one to press. A dice-choice field is a select field (TASK-51) whose options are dice sizes; a formula that names it rolls the chosen die. Then one dice cell per attack rolls the right die. Formulas are shared preset content, so they still run only through the parser in src/core/formula.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A preset field of type dice-choice lists die sizes as its options and shows as a select field on the sheet
- [ ] #2 A dice cell formula can roll the die chosen in a dice-choice field of its scope, with a count and arithmetic around it, for example one die of the chosen size plus a bonus field
- [ ] #3 A roll with no die chosen fails with the field error that names the field, as a roll with an empty number field does
- [ ] #4 The preset check refuses a formula that uses a dice-choice field where a number is expected, or a number field where a die is expected, and names the cell
- [ ] #5 The roll result and the Owlbear dice extension roll show the die that was rolled
- [ ] #6 presets/cairn-2e.json gives each weapon and each NPC attack one dice-choice field and one damage dice cell, and the deferred-work entry about die sizes from a field is closed
- [ ] #7 docs/preset-format.md, the spec copy of the format and docs/example-preset.json describe the field and the formula syntax; the example parse test passes
<!-- AC:END -->
