---
id: TASK-115.2
title: 'Step 0b: move the catch-up interpreter and timer registry out of the engine'
status: To Do
assignee: []
created_date: '2026-11-18T19:41:00Z'
labels:
  - architecture
  - replica
dependencies:
  - TASK-115.1
documentation:
  - >-
    _bmad-output/planning-artifacts/architecture/effect-sync-core-2026-11-18/DESIGN.md
parent_task_id: TASK-115
ordinal: 145000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The 17-branch `runCatchUp`, `catchUpTimers` keyed by string, `armCatchUpTimer` and `disarmCatchUpTimer` live in `engine.ts:310, 517-683`, so the interpreter of the catch-up decisions is tested only through full room simulation. They move to `catch-up-effects.ts`. Timers go through the one replica timer helper `schedule(signal, ms, fn)`, which returns a cancel function and cancels itself on abort and knows no keys; the map from a `CatchUpTimer` key to its cancel stays in `catch-up-effects.ts`. Lands only after step 0 is green so the engine suite sees one change at a time (owner decision, round 1).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `src/replica/catch-up-effects.ts` interprets every `CatchUpDecision`; `engine.ts` holds no catch-up timer map and no `runCatchUp` body
- [ ] #2 `src/replica/timers.ts` exports `schedule(signal, ms, fn)` returning a cancel function; a fired or cancelled timer never calls `fn` after `signal` aborts
- [ ] #3 Interpreter tests run on a fake helper with no real time
- [ ] #4 Engine suite junit list equals the baseline; `engine.ts` shrinks by about 180 lines
<!-- AC:END -->
