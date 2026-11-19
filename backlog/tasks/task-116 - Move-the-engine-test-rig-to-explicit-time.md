---
id: TASK-116
title: Move the engine test rig to explicit time
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-18T19:41:00Z'
updated_date: '2026-11-19T12:28:00Z'
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
- [ ] #1 The rig exposes `advance(ms)` on the mock clock and a test can fire a timer without real waiting
- [ ] #2 At least the `engine-catch-up`, `engine-liveness` and `engine-no-gm` files run on explicit time and their wall time drops; the junit list equals the baseline
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. tests/support/room-rig.ts builds the mock platform with a manual clock: now() from a counter, schedule() into a timer queue; the rig exposes advance(ms), which fires due timers in order and lets their promise work settle.
2. engine-catch-up, engine-liveness and engine-no-gm move from pause()/timing waits to advance(ms); waitUntil stays only where a test waits on another client's message.
3. Literals in those engine tests stay; only helpers and waits change. Junit list equals the baseline; wall time of the three files drops.
4. tdd chain (run ~/.claude/artifacts/task-115-20261119/TASK-116); full check.
<!-- SECTION:PLAN:END -->
