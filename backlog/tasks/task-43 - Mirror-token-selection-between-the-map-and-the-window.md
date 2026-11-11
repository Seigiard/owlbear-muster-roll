---
id: TASK-43
title: Mirror token selection between the map and the window
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-11T22:18:00Z'
updated_date: '2026-11-11T23:56:00Z'
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
- [x] #1 When a GM selects a linked token on the map, the window marks the tab of its sheet and, for a repeat block, marks that repeat block. The window does not switch tabs by itself
- [x] #2 Several selected tokens mark every linked sheet and repeat block. A cleared selection clears the marks
- [x] #3 From a sheet or a repeat block, a GM selects all its linked tokens on the map with one action. The same action again deselects them
- [x] #4 A linked token that is not on the current scene is skipped with no error
- [x] #5 Players see marks for their own selection. Selecting tokens from the window is GM-only
- [x] #6 Reading and changing the selection is a port in `src/platform/ports.ts` with the OBR and the mock adapter. E2E tests on the mock cover both directions
- [ ] #7 The owner checks both directions in a live Owlbear room
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Selection port in src/platform/ports.ts with the OBR adapter (OBR.player getSelection/onChange/select(ids,false)/deselect(ids)) and a per-client mock selection.
2. Pure core rules in src/core/token-selection.ts: marks from live links and a selection; one select/deselect step for a target's linked tokens on the open scene.
3. Window store src/ui/map-selection.ts for the selection and the open scene's items.
4. Window: a dot on the tab of each marked sheet, a bar on each marked repeat block, a GM-only toggle «Выделить на карте» on a linked sheet header and repeat block.
5. Unit tests beside sources, e2e on the mock in tests/selection.e2e.ts for both directions.
Build spec: _bmad-output/implementation-artifacts/spec-task-43-mirror-token-selection.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built on branch worktree-agent-a587ef72f38785ff5 through bmad-build; build spec _bmad-output/implementation-artifacts/spec-task-43-mirror-token-selection.md (review triage log inside).
Evidence per AC (all on the mock adapter):
- AC1: tests/selection.e2e.ts 'a GM who selects an NPC token on the map sees its tab and repeat block marked, with the open tab kept' - tab «NPC, токен выделен» and group «Скелет 1, токен выделен» appear while tab Аня stays selected.
- AC2: 'several selected tokens mark every target, and a cleared selection clears the marks'; unit tests in src/core/token-selection.test.ts (several, empty, unlinked, inert).
- AC3: 'a GM selects the tokens of a sheet on the open scene with one press and deselects them with the next' (selection goes [tree] -> [t-anya, tree] -> [tree], aria-pressed true/false); 'a GM selects the token of one repeat block from the keyboard'.
- AC4: same sheet test: t-anya-far (another scene) is skipped; 'a sheet whose linked tokens are all on another scene offers no selection'; unit 'skips a token that is not on the open scene'. Mutation removing the scene filter turns two e2e tests red.
- AC5: 'a player sees marks for their own selection on visible sheets only, and no selection command' (hidden NPC never marked, GM's own selection untouched, no Выделить button); 'a player's own sheet keeps «вы» in its name when its token is selected'.
- AC6: SelectionPort in src/platform/ports.ts; OBR adapter in src/platform/obr/index.ts (OBR.player getSelection/onChange/select(ids,false)/deselect(ids)); mock adapter with per-client selection (setMapSelection, failNextSelectionWrite) in src/platform/mock/; e2e covers both directions.
Full check: oxfmt clean, lint exit 0, typecheck clean, bun test 2465 pass, test:browser 451 pass, build ok.
AC7 waits for the owner's live-room check, so the task stays In Progress.
<!-- SECTION:NOTES:END -->
