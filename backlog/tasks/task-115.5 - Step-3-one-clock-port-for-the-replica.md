---
id: TASK-115.5
title: 'Step 3: one clock port for the replica'
status: To Do
assignee: []
created_date: '2026-11-18T19:41:00Z'
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
- [ ] #1 `src/platform/ports.ts` defines the clock port and both adapters implement it; the port contract covers it
- [ ] #2 `grep -c "Date.now\|performance.now" src/replica` is 0
- [ ] #3 The engine suite and `tests/support/room-rig.ts` are unchanged and green
<!-- AC:END -->
