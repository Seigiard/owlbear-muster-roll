---
id: TASK-120
title: Mark the GM offline only after a ping goes unanswered, also after a page pause
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T07:23:00Z'
updated_date: '2026-11-19T20:13:00Z'
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
- [x] #1 After the page's timers were stopped longer than `gmLinkTimeoutMs`, a live GM that answers the next ping is never shown offline
- [x] #2 A GM that answers no ping after the wake is still shown offline
- [x] #3 A module test reproduces the late timers after a pause and passes
- [x] #4 `formal/catch-up/check.sh` reports `hidden-page-offline` as passing, and the config and the replica-catch-up skill are updated to expect that
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. livenessTable keeps silenceDue and pingSentAt in the online phase. gm-silence takes the link offline only when it fires at most a quarter of gmLinkTimeoutMs late and its last ping is at least a quarter old; otherwise it pings and arms gm-silence for a quarter (recheck).
2. Unit tests in liveness-machine.test.ts and catch-up.test.ts: the late timers after a pause, a wake just before the silence, the recheck that hears nothing, a watch moving silenceDue.
3. Catch-up model: Fire passes hidden as late and chooses the ping's age; the finding becomes mutations/silence-ignores-pause.cfg, add hidden-page.cfg and mutations/silence-ignores-ping-age.cfg; update the skill, AD-6 and the edit-delivery map.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The GM link now goes offline only on a ping the GM left unanswered (a20f769). gm-silence decides only when it fires at most a quarter of gmLinkTimeoutMs late and the last ping is at least a quarter old; otherwise it keeps the link online, pings and checks again a quarter later. So after a frozen tab or a sleeping laptop, a GM that answers the wake's ping stays online and no gm-return catch-up starts, while a GM that answers nothing goes offline at the recheck. Module tests pin the pause, a wake just before the silence, the unanswered recheck and a watch moving the due time; removing each part turns a test red. The catch-up model decides the same way (49a1ee9): the former finding hidden-page-offline.cfg is now mutations/silence-ignores-pause.cfg (renamed, per the skill's rule for a fixed finding), hidden-page.cfg checks NoPrematureOffline with every invariant, and silence-ignores-ping-age.cfg breaks NoPrematureOfflineVisible. Accepted: under Chrome's intensive throttling of a long-hidden tab every silence is late, so the GM stays online until the timers run on time again. Checks: bun test 3619 pass, test:browser 587 pass (one unrelated flake per run, passed on rerun), mutants 53/53, catch-up and edit-delivery models as expected, drift ok.
<!-- SECTION:FINAL_SUMMARY:END -->
