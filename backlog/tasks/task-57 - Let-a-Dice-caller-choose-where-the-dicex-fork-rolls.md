---
id: TASK-57
title: Let a Dice+ caller choose where the dicex fork rolls
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T11:57:00Z'
updated_date: '2026-11-12T11:59:00Z'
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
- [ ] #1 A Dice+ roll request may carry `rollIn`: "auto", "window" or "tray"; a request without it, or with an unknown value, rolls exactly as after TASK-54 ("auto")
- [ ] #2 "window" rolls in the Dicex window and opens it first when it is closed
- [ ] #3 "tray" rolls in the popover tray even when the Dicex window is open, and falls back to the window when the tray does not answer in time
- [ ] #4 The isReady answer tells a caller that this dicex understands `rollIn`, so it can tell the fork from original Dice+
- [ ] #5 The dicex Dice+ protocol docs describe `rollIn`, its default and its fallbacks
- [ ] #6 dicex tests and build pass, and PR #2 carries the change
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
