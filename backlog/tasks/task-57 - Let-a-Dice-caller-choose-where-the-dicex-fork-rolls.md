---
id: TASK-57
title: Let a Dice+ caller choose where the dicex fork rolls
status: To Do
assignee: []
created_date: '2026-11-12T11:57:00Z'
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
