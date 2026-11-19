---
id: TASK-120
title: Mark the GM offline only after a ping goes unanswered, also after a page pause
status: To Do
assignee: []
created_date: '2026-11-19T07:23:00Z'
labels: []
dependencies: []
references:
  - formal/catch-up
  - .claude/skills/replica-catch-up/SKILL.md
priority: low
type: bug
ordinal: 159000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A player's client shows the GM offline when it has not heard a GM for `gmLinkTimeoutMs` (20 s). `watch()` in `src/replica/catch-up.ts` arms a `ping` timer and a `gm-silence` timer together. When the page's timers stop for longer than that (a frozen background tab, a laptop asleep), both fire one after the other on wake: `fired('ping')` sends a ping and `fired('gm-silence')` runs at once and sets `gmLink` to offline before the GM can answer. The GM's `alive` then sets it back to online and, as the player is live, `enter('gm-return')` starts a catch-up that was not needed. The player sees "GM offline" flicker. This breaks the CLAUDE.md rule that a timer only schedules work and a rule decides on the answer it received. Found by the TLA+ model `formal/catch-up/` (config `findings/hidden-page-offline.cfg`, invariant `NoPrematureOffline`) and replayed on the real `createCatchUp`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After the page's timers were stopped longer than `gmLinkTimeoutMs`, a live GM that answers the next ping is never shown offline
- [ ] #2 A GM that answers no ping after the wake is still shown offline
- [ ] #3 A module test reproduces the late timers after a pause and passes
- [ ] #4 `formal/catch-up/check.sh` reports `hidden-page-offline` as passing, and the config and the replica-catch-up skill are updated to expect that
<!-- AC:END -->
