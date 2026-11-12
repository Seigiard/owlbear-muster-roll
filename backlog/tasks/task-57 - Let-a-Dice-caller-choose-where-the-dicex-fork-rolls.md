---
id: TASK-57
title: Let a Dice+ caller choose where the dicex fork rolls
status: Done
assignee:
  - '@claude'
created_date: '2026-11-12T11:57:00Z'
updated_date: '2026-11-12T13:57:00Z'
labels: []
dependencies:
  - TASK-54
priority: medium
type: task
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-54 made the dicex fork pick the roll place by itself: the Dicex window when it is open, else the popover tray. The owner wants the caller to choose, so any extension can use it as it wants. Add an optional field to the Dice+ roll request in the fork, on the PR #2 branch `dice-plus-roll-without-action` (https://github.com/Seigiard/dicex/pull/2), before that PR is merged. Muster Roll sends nothing new and keeps the automatic choice; a Muster Roll setting would be a separate task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Dice+ roll request may carry `rollIn`: "auto", "window" or "tray"; a request without it, or with an unknown value, rolls exactly as after TASK-54 ("auto")
- [x] #2 "window" rolls in the Dicex window and opens it first when it is closed
- [x] #3 "tray" rolls in the popover tray even when the Dicex window is open, and falls back to the window when the tray does not answer in time
- [x] #4 The isReady answer tells a caller that this dicex understands `rollIn`, so it can tell the fork from original Dice+
- [x] #5 The dicex Dice+ protocol docs describe `rollIn`, its default and its fallbacks
- [x] #6 dicex tests and build pass, and PR #2 carries the change
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Build spec: _bmad-output/implementation-artifacts/spec-task-57-choose-where-dicex-rolls.md. Code lives in the dicex fork worktree /Users/seigiard/Projects/dicex-task-54, branch dice-plus-roll-without-action (PR #2), base 52f7410.
1. dicePlusProtocol.ts: optional rollIn on RollRequest, a resolver (absent/unknown -> auto), features on IsReadyResponse.
2. relayRollRequest routes by rollIn: auto = TASK-54 routing; window = open the action and relay there; tray = popover handshake even when the window is open, fall back to the action on timeout.
3. isReady replies carry features: ["rollIn"].
4. README Dice+ section documents rollIn, its default, fallbacks and the isReady advertisement.
5. Tests beside the changed modules; yarn test + yarn build; push the branch so PR #2 updates; update the PR text; draft the upstream PR text.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Build 2026-11-12 in the dicex fork (worktree /Users/seigiard/Projects/dicex-task-54, branch dice-plus-roll-without-action, on TASK-54 tip 52f7410). A Dice+ roll request may carry rollIn?: "auto" | "window" | "tray"; resolveRollIn turns absent or unknown values into "auto" (TASK-54 routing). "window" opens the action and relays there; "tray" uses the popover handshake even with the window open and falls back to the action route after 2 s. Every isReady reply carries features: ["rollIn"]; permitted stays only with source. README Dice+ section documents both. Commits 8e67c10, dfda172, 48bcadf, a1d2557, ad58473; pushed to origin, PR #2 https://github.com/Seigiard/dicex/pull/2 updated (title and body), CI test job passed on ad58473. Not merged: merging deploys GitHub Pages, the owner's step.
Checks at ad58473: npx yarn@1.22.22 test 40 files / 333 tests pass; npx yarn@1.22.22 build exit 0. Mutation calibration: unknown->tray, unknown->window, window->popover-first, tray->action-direct and isRollRequest rejecting unknown rollIn each turn their owner test red. Review: revmux mixed-terra 9/9 sources, 1 minor (rejected as low, listed in the PR), 3 immaterial. Run dir ~/.claude/artifacts/tdd-20261112-130019/task-57-choose-where-dicex-rolls/.
AC evidence: #1 coordinator tests 'keeps an unknown string rollIn on the action route when the action is open', 'keeps a numeric rollIn on the ready popover route when the action is closed', the four TASK-54 routing tests unchanged, and protocol test 'accepts unknown rollIn values'. #2 'uses the action route for window rollIn when the action is closed' (action.open 1, internal roll = payload, no popover ping) and '... when the action is open'. #4 dicePlusIsReady 'responds with its rollIn feature on the same channel' and dicePlusAccess 'keeps permitted absent and advertises rollIn without source' / 'reports permitted: true for an allowed source' (features = ["rollIn"]). #5 README 'Choose where to roll' and 'Check without asking' bullets. #6 test/build above and PR #2 CI. #3 routing is proven by 'uses the ready popover route for tray rollIn when the action is open' (popover roll only, action.open 0, no internal ping/roll) and both 'falls back from a silent tray rollIn' tests; left unchecked until the owner sees a tray roll with the Dicex window open in a live room (one roll, the window shows none, one result).
Known limit (review, rejected as low): with "tray" and the window open, a hand roll in the window at the same moment makes remote trays show whichever roll wrote player metadata last; the roll-result stays correct.

2026-11-12: the owner accepted AC #3 on test evidence («TASK-57 закрывай»): Muster Roll sends no rollIn, so "tray"/"window" cannot be triggered in a live room without another caller. Routing for "tray" with the window open and its 2 s fallback is covered by the coordinator tests, each calibrated against a deliberate breakage. Fork PR #2 merged (c5738b2) and deployed; the owner's live check of the "auto" path passed. Upstream PR: https://github.com/abottchen/dicex/pull/24.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A Dice+ caller can now choose where the dicex fork rolls: optional rollIn "auto" | "window" | "tray" on the roll request. Absent or unknown means "auto" (the TASK-54 behaviour). "window" opens the Dicex window if needed and rolls there; "tray" rolls in the popover even when the window is open and falls back to the window after 2 s of silence. Every isReady reply carries features: ["rollIn"], so a caller can tell the fork from original Dice+. The roll runs once and returns one roll-result. Muster Roll sends nothing new. Verified by 333 dicex tests with mutation calibration and one revmux round; the "tray"/"window" paths were accepted on tests by the owner, since no live caller sends rollIn. Upstream PR abottchen/dicex#24.
<!-- SECTION:FINAL_SUMMARY:END -->
