---
id: TASK-116
title: Move the engine test rig to explicit time
status: Done
assignee:
  - '@claude'
created_date: '2026-11-18T19:41:00Z'
updated_date: '2026-11-19T15:33:00Z'
labels:
  - tests
  - replica
dependencies:
  - TASK-115.5
references:
  - >-
    _bmad-output/planning-artifacts/architecture/effect-sync-core-2026-11-18/DESIGN.md
priority: low
ordinal: 155000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the clock port lands (ADR-0004 step 3), `tests/support/room-rig.ts` still waits on real time: `waitUntil` polls every 2 ms up to 2000 ms and `pause()` sleeps, so engine tests depend on the speed of the CI machine and two-GM cases under mutation M5 are racy (`deferred-work.md`, TASK-48). The owner set this apart from step 3 (decision Q9): migrate file by file to an `advance(ms)` on the mock clock, keeping `waitUntil` only where a test waits on another client.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The rig exposes `advance(ms)` on the mock clock and a test can fire a timer without real waiting
- [x] #2 At least the `engine-catch-up`, `engine-liveness` and `engine-no-gm` files run on explicit time and their wall time drops; the junit list equals the baseline
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. tests/support/room-rig.ts builds the mock platform with a manual clock: now() from a counter, schedule() into a timer queue; the rig exposes advance(ms), which fires due timers in order and lets their promise work settle.
2. engine-catch-up, engine-liveness and engine-no-gm move from pause()/timing waits to advance(ms); waitUntil stays only where a test waits on another client's message.
3. Literals in those engine tests stay; only helpers and waits change. Junit list equals the baseline; wall time of the three files drops.
4. tdd chain (run ~/.claude/artifacts/task-115-20261119/TASK-116); full check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on task-116-rig-explicit-time (b7388f2). tests/support/room-rig.ts: createRoomRig({ clock: 'manual' }) gives every client of the room one manual clock (now() from a counter, schedule() into one queue by due time then insertion) and rig.advance(ms) fires due timers in order and lets their promise work settle; real time stays the default. engine-catch-up, engine-liveness and engine-no-gm run on it: no pause() left, three elapsed-time observations read roomRig.now(), literals unchanged. Wall time: 6.68->0.42 s, 4.25->0.25 s, 4.35->0.22 s. Checks: fmt, lint, typecheck, build; browser 587/587; bun: no baseline line lost; the three files green in three repeats.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The room rig can run on a manual clock (PR #72): createRoomRig({ clock: 'manual' }) and rig.advance(ms). engine-catch-up, engine-liveness and engine-no-gm run on it: 6.68 -> 0.42 s, 4.25 -> 0.25 s, 4.35 -> 0.22 s. Other engine files still use real time (deferred-work.md). The closing review noted one delay check in engine-catch-up that became true by construction (deferred).
<!-- SECTION:FINAL_SUMMARY:END -->
