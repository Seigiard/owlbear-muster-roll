---
id: TASK-122
title: Revisit merging the engine helper modules after TASK-115
status: To Do
assignee: []
created_date: '2026-11-19T08:22:00Z'
updated_date: '2026-11-20T06:15:00Z'
labels:
  - architecture
  - replica
dependencies:
  - TASK-115.11
priority: low
ordinal: 163000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Architecture review 2026-11-18, candidate 2: `command-routing`, `room-protocol`, `generation-flow` and `roll-flow` take 23, 23, 22 and 15 callback ports from `engine.ts`, each with one adapter (`startReplicaEngine`); 18 fields repeat across the fans (`role` x4, `stopped`, `sendRemote`, `records`, `publish`, `presetOf` x3). The review proposed merging them back into the engine as functions over one state object and deleting their 2.4k lines of fake-engine tests. The owner deferred it on 2026-11-19: ADR-0004 keeps module boundaries and their ports (DESIGN.md:28), and TASK-115 is reshaping the same modules on `epic/task-115` (115.4 AbortSignal removes `stopped`, 115.5 the clock, 115.6 the failure sink, 115.9 and 115.10 rewrite generation-flow, room-protocol and roll-flow as tables or judge them). When TASK-115 closes: measure each remaining `*Ports` type; a module whose fan is still wider than about 10 fields with one adapter is a candidate for merging into the engine, and the module tests that drive a fake engine through callbacks are judged against the rig suite `engine-*.test.ts`. Outcome is a grilling with the owner, then either an ADR amendment or a recorded rejection.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every `*Ports` type in `src/replica` is measured at the TASK-115 epic tip and the numbers are in this task
- [ ] #2 For each module with a fan wider than about 10 fields and one adapter, the owner has decided merge or keep, and ADR-0004 carries the decision
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured 2026-11-20 at 34131dc, after TASK-115 closed (all dependencies done). Fields per *Ports type in src/replica: RoomProtocolPorts 25, CommandRoutingPorts 24, GenerationFlowPorts 23, RollFlowPorts 17, CatchUpEffectsPorts 0 (type is not an object literal of fields). All four fans stay wider than the ~10-field threshold with one adapter each (startReplicaEngine), so all four are merge candidates for the AC#2 grilling. Task is unblocked.
<!-- SECTION:NOTES:END -->
