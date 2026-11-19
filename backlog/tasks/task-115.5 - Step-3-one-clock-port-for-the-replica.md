---
id: TASK-115.5
title: 'Step 3: one clock port for the replica'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-18T19:41:00Z'
updated_date: '2026-11-19T15:33:00Z'
labels:
  - architecture
  - replica
  - platform
dependencies:
  - TASK-115.4
documentation:
  - >-
    _bmad-output/planning-artifacts/architecture/effect-sync-core-2026-11-18/DESIGN.md
parent_task_id: TASK-115
ordinal: 148000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The replica reads time from two sources, `Date.now` (`catch-up.ts:316`, `engine.ts:744, 771`, `room-protocol.ts:283`) and `performance.now` (`pending-edits.ts:212`, `dice-extension.ts:216, 312, 392`). A clock port `{ now, schedule }` in `ports.ts` with the OBR and mock adapters gives one source; the engine and the timer helper take time from it. Owner decision Q9: moving the test rig to explicit time and replacing `pause()` and `waitUntil` is a later task, not this one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `src/platform/ports.ts` defines the clock port and both adapters implement it; the port contract covers it
- [x] #2 `grep -c "Date.now\|performance.now" src/replica` is 0
- [ ] #3 The engine suite and `tests/support/room-rig.ts` are unchanged and green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ports.ts: Clock = { now: () => number; schedule: Schedule }; Schedule moves to ports.ts; the schedule implementation moves to src/platform/schedule.ts and both adapters expose platform.clock.
2. now() is wall-clock milliseconds (the dice protocol and diagnostics need wall time); every Date.now and performance.now in src/replica reads the clock instead.
3. Port contract scenario for the clock; engine suite and room-rig unchanged.
4. tdd chain (run ~/.claude/artifacts/task-115-20261119/TASK-115.5); full check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on task-115-5-clock-port (b52408a). ports.ts: ClockPort { now, schedule } and Schedule; Platform.clock in both adapters ({ now: () => Date.now(), schedule }); the schedule implementation moved to src/platform/schedule.ts and src/replica/timers.ts is gone. Every Date.now and performance.now in src/replica reads the clock (grep count 0); no setTimeout under src/replica. The shared port contract has a clock scenario (mock and Chromium). Engine tests and room-rig unchanged. Checks: fmt, lint, typecheck, build; browser 584/584; bun: the moved schedule tests keep their names. Calibrated the clock row.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Platform.clock { now, schedule } in ports.ts with both adapters (PR #70); src/replica production code has no Date.now, performance.now or setTimeout; schedule tests moved to src/platform/schedule.test.ts. AC #3 is left unchecked: engine test factories needed one-line import and factory edits to pass the clock (recorded in deferred-work.md); their assertions did not change.
<!-- SECTION:FINAL_SUMMARY:END -->
