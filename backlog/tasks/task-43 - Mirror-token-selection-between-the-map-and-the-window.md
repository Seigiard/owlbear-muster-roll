---
id: TASK-43
title: Mirror token selection between the map and the window
status: To Do
assignee: []
created_date: '2026-11-11T22:18:00Z'
labels: []
dependencies:
  - TASK-41
references:
  - https://github.com/jtaccinelli/simple-hp-tracker
priority: medium
type: feature
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With many linked tokens on the map, a GM cannot tell which sheet or repeat block a token belongs to without opening it, and cannot find the tokens of a sheet without hunting on the map. The owner asked for selection to follow the token link both ways, as in simple-hp-tracker: a token selected on the map highlights its row, and a row click selects its token. That extension reads `OBR.player.getSelection` and `OBR.player.onChange`, and writes with `OBR.player.select(ids, false)` and `OBR.player.deselect(ids)`. It only highlights: it does not scroll or switch views. Token links to repeat blocks come with TASK-41, so this task waits for it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When a GM selects a linked token on the map, the window marks the tab of its sheet and, for a repeat block, marks that repeat block. The window does not switch tabs by itself
- [ ] #2 Several selected tokens mark every linked sheet and repeat block. A cleared selection clears the marks
- [ ] #3 From a sheet or a repeat block, a GM selects all its linked tokens on the map with one action. The same action again deselects them
- [ ] #4 A linked token that is not on the current scene is skipped with no error
- [ ] #5 Players see marks for their own selection. Selecting tokens from the window is GM-only
- [ ] #6 Reading and changing the selection is a port in `src/platform/ports.ts` with the OBR and the mock adapter. E2E tests on the mock cover both directions
- [ ] #7 The owner checks both directions in a live Owlbear room
<!-- AC:END -->
