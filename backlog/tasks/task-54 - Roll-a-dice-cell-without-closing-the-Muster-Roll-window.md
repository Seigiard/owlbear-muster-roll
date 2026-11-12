---
id: TASK-54
title: Roll a dice cell without closing the Muster Roll window
status: To Do
assignee: []
created_date: '2026-11-12T02:21:00Z'
labels:
  - v2
dependencies:
  - TASK-36
references:
  - https://github.com/Seigiard/dicex
  - https://github.com/abottchen/dicex
type: enhancement
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pressing a dice cell rolls through the dice extension (TASK-36), and the roller sees the Muster Roll window close and the dicex window open in its place. To roll again or go on editing, the roller switches back by hand. Other players see the same roll only as the dice tray at the bottom right of the room, with no window change. The roller should see it the same way. Cause, read from the fork Seigiard/dicex (~/Projects/dicex) at 47cd243: relayRollRequest in src/plugin/dicePlusBackgroundCoordinator.ts calls OBR.action.open() before every Dice+ roll, because the handler that runs the roll (src/plugin/dicePlusInternalRollHandler.ts) lives in the action page. Owlbear shows one action window at a time, so the dicex action replaces ours. The tray other players see is the popover from src/background.ts and src/plugin/PopoverTrays.tsx. The change is most likely in the fork, with a small upstream PR after the owner review, as for TASK-36.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pressing a dice cell in Muster Roll leaves the Muster Roll window open and focused; the dicex window does not open
- [ ] #2 The roller sees the 3D dice and the result in the bottom-right dice tray, as other players see a remote roll
- [ ] #3 Other clients see the roll as they do today, and an NPC roll still reaches the roller and the GM only
- [ ] #4 The rolled values still come back to Muster Roll, so the notification and the comparison outcome match the dice
- [ ] #5 A roll started from the dicex window itself still opens and behaves as before
- [ ] #6 Dice+ (the commercial extension) behaves as it does today, or the task records how it differs
- [ ] #7 The owner checks the change in a live room with the deployed fork
<!-- AC:END -->
