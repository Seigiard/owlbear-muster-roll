---
id: TASK-54
title: Roll a dice cell without closing the Muster Roll window
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T02:21:00Z'
updated_date: '2026-11-12T11:36:00Z'
labels:
  - v2
dependencies:
  - TASK-36
references:
  - https://github.com/Seigiard/dicex/issues/1
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
- [x] #4 The rolled values still come back to Muster Roll, so the notification and the comparison outcome match the dice
- [ ] #5 A roll started from the dicex window itself still opens and behaves as before
- [x] #6 Dice+ (the commercial extension) behaves as it does today, or the task records how it differs
- [ ] #7 The owner checks the change in a live room with the deployed fork
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Build spec: _bmad-output/implementation-artifacts/spec-task-54-roll-without-closing-the-window.md. Code lives in the dicex fork, branch dice-plus-roll-without-action (worktree /Users/seigiard/Projects/dicex-task-54, base origin/main 47cd243); Muster Roll needs no code change.
1. Background routes a Dice+ roll by OBR.action.isOpen(): open -> today's path to the action page; closed -> new popover channels with a ping/ready handshake; no popover answer in 2 s -> fall back to opening the action.
2. The popover mounts the roll handler, result reporter, metadata sync, roll log and Rumble subscriptions, and shows the roller's own tray at the bottom right.
3. Unit tests for routing, fallback and the popover handler; yarn test + yarn build.
4. Push the branch to the fork and open a PR inside the fork; draft the upstream PR text for the owner.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Build 2026-11-12 (dicex fork, branch dice-plus-roll-without-action, worktree /Users/seigiard/Projects/dicex-task-54): the background routes a Dice+ roll by OBR.action.isOpen(). Window open: today's path to the action page. Window closed: the popover (already mounted on every client by src/background.ts) answers new LOCAL channels rodeo.owlbear.dice/popover-ping|ready|roll, runs the roll in its own stores, publishes metadata, GM reveal, roll log, Rumble and one {source}/roll-result, and shows the roller's own tray at the bottom right (src/plugin/DicePlusPopoverRollTray.tsx). Popover silent 2 s: falls back to opening the action. Muster Roll needs no code change. Checks in the fork: yarn test 40 files / 325 tests pass, yarn build exit 0; routing, channel isolation and host effects are mutation-calibrated. Review round 1 (revmux, 9/9 sources) found 4 majors, all fixed (lost roll after the action handshake timeout, tray stuck after exploding dice, click before settle shrinking the popover, stale comment); 1 minor deferred (a remote tray can cover the roller's tray; all trays share one spot).

Fork PR: https://github.com/Seigiard/dicex/pull/2 (head dice-plus-roll-without-action, base main of the fork; CI test job passed). Commits c170000 (tests) and 52f7410 (feature) on 47cd243. Issue comment: https://github.com/Seigiard/dicex/issues/1#issuecomment-6822489617. Not merged: merging to the fork's main deploys GitHub Pages, so it is the owner's step.
AC evidence: #4 - src/plugin/dicePlusPopoverRollHost.test.ts 'reports a completed popover roll to the requesting Dice+ source' asserts the literal {source}/roll-result payload (rollId, playerId, playerName, rollTarget, totalValue 4, groups) from a popover roll, the same shape the action page sends; Muster Roll parses it unchanged. #6 - Muster Roll has no code change (no diff in src/ or tests/ against 5d59ae9), so a room with the commercial Dice+ behaves as before. #1, #2, #3, #5, #7 need the owner's live-room check with the fork build: unit tests show action.open is never called on the popover path and the popover publishes metadata, GM reveal, roll log and Rumble like the action page, but the tray rendering is not testable in node.
Deferred: a remote player's tray can cover the roller's tray (all popover trays share one spot); entry in _bmad-output/implementation-artifacts/deferred-work.md.
<!-- SECTION:NOTES:END -->
