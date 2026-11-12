---
title: 'TASK-54 Roll a dice cell without closing the Muster Roll window'
type: 'feature'
created: '2026-11-12'
status: 'in-progress'
baseline_commit: '47cd243f84be492b9026590177c62a32cacab454' # dicex fork, /Users/seigiard/Projects/dicex-task-54
route: 'dispatch'
review_loop_iteration: 0
context:
  - '/Users/seigiard/Projects/dicex-task-54/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A Dice+ roll request (Muster Roll dice cell, TASK-36) makes the dicex fork call `OBR.action.open()`, because only its action page can run a roll. Owlbear shows one action window at a time, so the Muster Roll window closes and the dicex window replaces it. Other players see the same roll only in the bottom-right tray popover. Backlog task: TASK-54.

**Approach:** All code lives in the dicex fork worktree `/Users/seigiard/Projects/dicex-task-54` (branch `dice-plus-roll-without-action`, base `origin/main` 47cd243). When the dicex window is closed, the background relays the Dice+ roll to the popover page that every client already has. The popover runs the roll in its own tray at the bottom right, publishes it like the action page does, and reports the result. When the dicex window is open, the roll goes there as today. Muster Roll needs no code change.

## Boundaries & Constraints

**Always:**
- Route by `OBR.action.isOpen()` in the background: open → today's path unchanged; closed → popover path.
- The popover path has its own LOCAL channels with a nonce ping/ready handshake, so the action page and the popover never both answer or both roll.
- No popover ready within the handshake timeout → fall back to today's path (open the action, relay there). A roll is never lost.
- The popover-side roll has the same effects as an action-side Dice+ roll today: player metadata sync with hidden values stripped, GM reveal for `hiddenAudience: "gm"`, roll log entry, Rumble message, and one result on `{source}/roll-result` with the same shape.
- The roller's own popover tray shows the roll, also a hidden one (lock mark as for a GM reveal), with the roller's name and total, and hides 5 s after the dice settle, like a remote tray.
- Access checks, notation errors and `roll-error` replies stay as they are.

**Never:**
- Calling `OBR.action.open()` on the popover path.
- Changing the dicex window UI, rolls started from it, or the Dice+ protocol seen by callers.
- Dragging dice to reroll in the popover tray; a click on the roller's tray only hides it.
- Pushing to `main` of the fork, or touching `upstream`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Window closed | Allowed `roll-request` for this player, dicex action closed, popover answers ping | Roll runs in the popover; `action.open` not called; one `roll-result` | N/A |
| Window open | Same request, dicex action open | Today's path: internal ping/roll to the action page; popover gets no roll | N/A |
| Popover silent | Action closed, no popover ready in 2 s | `action.open` and today's internal relay | N/A |
| Hidden target | `rollTarget` `self` / `dm` / `gm_only` | Roll hidden as today; roller's tray shows it; `dm`/`gm_only` revealed to GM clients | N/A |
| Refused | Denied source or bad notation | `roll-error` as today; no relay | as today |

</frozen-after-approval>

## Code Map

All paths are in `/Users/seigiard/Projects/dicex-task-54`.

- `src/plugin/dicePlusBackgroundCoordinator.ts` -- `relayRollRequest`: always opens the action, then ping/ready/roll on `INTERNAL_*`. Add the routing and the popover path with fallback here.
- `src/plugin/dicePlusProtocol.ts` -- `INTERNAL_*` channel constants; add the popover channels beside them.
- `src/plugin/dicePlusInternalRollHandler.ts` -- action-side ping→ready and roll→`setPendingRollRequest` + `rollFromNotation(hidden, hiddenAudience)`. Reuse it for the popover by passing the channel set; keep the action behaviour identical.
- `src/plugin/DicePlusHandler.tsx`, `DiceRollSync.tsx`, `RollLogger.tsx`, `RumbleSync.tsx` -- store subscriptions the action Sidebar (`src/controls/Sidebar.tsx`) mounts. Mount the same set once in the popover; each iframe has its own zustand stores.
- `src/popover.tsx`, `src/plugin/PopoverTrays.tsx` -- popover root; sizes the popover from `visibleTrays` (0×0 when none). Add the roller's tray to that list under a key that is not a connection id.
- `src/plugin/PopoverTray.tsx` -- remote tray frame (Paper 250×282, Slide, 5 s timeout, `AnimatedPlayerCamera`, name | total). Copy its frame for the roller's tray; do not change remote trays.
- `src/dice/InteractiveDiceRoll.tsx`, `src/dice/DiceRoll.tsx`, `src/dice/useExplosionWaves.ts` -- local physics roll driving `useDiceRollStore.finishDieRoll` with explosion waves; `InteractiveDiceRoll` hard-codes draggable `InteractiveDice`. The roller's tray needs this roll without dragging.
- `src/integration/setup.ts` -- OBR mock: `obrConfig.actionIsOpen`, `obrCalls.actionOpenCount`, `simulateBroadcast`.
- `src/plugin/dicePlusBackgroundCoordinator.test.ts`, `dicePlusInternalRollHandler.test.ts` -- existing tests; keep them green, extend them.

## Tasks & Acceptance

**Execution:**
- [ ] `src/plugin/dicePlusProtocol.ts` -- add popover ping/ready/roll channel constants -- separate audiences.
- [ ] `src/plugin/dicePlusBackgroundCoordinator.ts` -- route by `action.isOpen()`; popover handshake; fallback to the action path on timeout -- the Matrix rows 1–3.
- [ ] `src/plugin/dicePlusInternalRollHandler.ts` -- take the channel set as a parameter, default `INTERNAL_*` -- one roll handler for both pages.
- [ ] `src/plugin/` new popover roll host (handler + reporter + sync + logger + rumble) and the roller's tray component; mount in `src/plugin/PopoverTrays.tsx` -- popover rolls and shows.
- [ ] unit tests beside the changed modules -- Matrix rows 1–3 in the coordinator; the popover handler answers only popover channels and starts the roll with the request's visibility; the action handler ignores popover channels.

**Acceptance Criteria:**
- Given the dicex window is closed, when a permitted Dice+ request arrives for this player, then `OBR.action.open` is never called and the result arrives on `{source}/roll-result`.
- Given the dicex window is open, when the same request arrives, then today's test expectations for `relayRollRequest` still hold.
- Given the change, when `yarn test` and `yarn build` run in the dicex worktree, then both exit 0.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

Why the popover: it is already mounted on every client by `src/background.ts`, it already renders physics trays, and Owlbear lets it show without replacing the current action window. A background-only headless roll would need a new physics loop; the popover reuses the existing one.

Applies to every Dice+ caller, not only Muster Roll: with the dicex window closed any extension's roll now shows in the tray instead of opening the window. This matches the goal (the roller sees a roll like the others) and keeps the window path when the roller has it open.

Muster Roll and the commercial Dice+ are untouched, so a room with Dice+ behaves as before.

## Verification

**Commands** (run in `/Users/seigiard/Projects/dicex-task-54`; yarn comes through npx):
- `npx yarn@1.22.22 test` -- expected: all tests pass (baseline 316).
- `npx yarn@1.22.22 build` -- expected: exit 0 (`tsc` + `vite build`).

**Manual checks (owner, live room with the fork build):**
- Muster Roll window stays open on a dice cell press; the roller sees 3D dice and the total in the bottom-right tray; other clients and the GM-only NPC case look as before; the notification total matches the dice; a roll from the dicex window behaves as before.
