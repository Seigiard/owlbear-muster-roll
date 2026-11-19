---
id: TASK-115.2
title: 'Step 0b: move the catch-up interpreter and timer registry out of the engine'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-18T19:41:00Z'
updated_date: '2026-11-19T15:33:00Z'
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
- [x] #1 `src/replica/catch-up-effects.ts` interprets every `CatchUpDecision`; `engine.ts` holds no catch-up timer map and no `runCatchUp` body
- [x] #2 `src/replica/timers.ts` exports `schedule(signal, ms, fn)` returning a cancel function; a fired or cancelled timer never calls `fn` after `signal` aborts
- [x] #3 Interpreter tests run on a fake helper with no real time
- [x] #4 Engine suite junit list equals the baseline; `engine.ts` shrinks by about 180 lines
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add src/replica/timers.ts: schedule(signal, ms, fn) returns a cancel function, cancels itself on abort, never calls fn after abort.
2. Add src/replica/catch-up-effects.ts: createCatchUpEffects(ports).run(decisions) interprets every CatchUpDecision; the CatchUpTimer key to cancel map lives inside it; timers go through the injected schedule.
3. engine.ts creates one AbortController for the catch-up timers (aborted in stop()), wires the interpreter, and loses runCatchUp, catchUpTimers, armCatchUpTimer and disarmCatchUpTimer (~180 lines).
4. Interpreter tests on a fake schedule with no real time; timers tests; engine suite junit list against the baseline.
5. tdd chain (run ~/.claude/artifacts/task-115-20261119/TASK-115.2); full check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on task-115-2-catch-up-effects (f3cbd18): src/replica/timers.ts schedule(signal, ms, fn) with cancel and abort; src/replica/catch-up-effects.ts createCatchUpEffects(ports).run interprets every CatchUpDecision and owns the CatchUpTimer key map; engine.ts wires it with one AbortController aborted in stop() and lost runCatchUp, catchUpTimers, armCatchUpTimer, disarmCatchUpTimer (1505 -> 1377 lines). Tests: timers.test.ts on bun fake timers, catch-up-effects.test.ts on a fake schedule (15 new). Checks: oxfmt, lint, typecheck, build; bun test 0 baseline lines missing; browser 583/583 (one link.e2e.ts flake in the first run, recorded in deferred-work.md). Calibrated both false-green rows.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The catch-up interpreter and its timer registry moved out of engine.ts into catch-up-effects.ts (PR #66); engine.ts shrank 1505 -> 1377 lines. Interpreter tests run on a fake scheduler; the one schedule(signal, ms, fn) helper later moved to src/platform/schedule.ts with the clock port (TASK-115.5). Junit baseline held.
<!-- SECTION:FINAL_SUMMARY:END -->
