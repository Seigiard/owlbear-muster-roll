---
id: TASK-122
title: Revisit merging the engine helper modules after TASK-115
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T08:22:00Z'
updated_date: '2026-11-20T06:28:00Z'
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
- [x] #1 Every `*Ports` type in `src/replica` is measured at the TASK-115 epic tip and the numbers are in this task
- [x] #2 For each module with a fan wider than about 10 fields and one adapter, the owner has decided merge or keep, and ADR-0004 carries the decision
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured 2026-11-20 at 34131dc, after TASK-115 closed (all dependencies done). Fields per *Ports type in src/replica: RoomProtocolPorts 25, CommandRoutingPorts 24, GenerationFlowPorts 23, RollFlowPorts 17, CatchUpEffectsPorts 0 (type is not an object literal of fields). All four fans stay wider than the ~10-field threshold with one adapter each (startReplicaEngine), so all four are merge candidates for the AC#2 grilling. Task is unblocked.

Re-measured 2026-11-20 at 84b1218 (master after TASK-115): RoomProtocolPorts 25, CommandRoutingPorts 24, GenerationFlowPorts 23, RollFlowPorts 17, CatchUpEffectsPorts 15. Correction to the note above: CatchUpEffectsPorts is an object type of 15 readonly fields, not 0; the first count missed readonly fields. Each type has one adapter, startReplicaEngine in src/replica/engine.ts (lines 406, 472, 525, 576, 1286). CatchUpEffectsPorts is not a candidate: ADR-0004 step 0b moved the catch-up interpreter out of the engine on purpose.

Owner decision 2026-11-20, through a decision brief to the orchestrator, quoted: "Оставить все (Recommended)". Keep room-protocol, command-routing, generation-flow and roll-flow as separate modules with their ports; do not merge them into engine.ts. Reason: TASK-125, TASK-132, TASK-103, TASK-102, TASK-106 and TASK-99 edit room-protocol and the edit-delivery model; a merge now would make them wait and rewrite the model's code mappings. Revisit after those six tasks have landed. Recorded as an amendment in the Consequences of docs/adr/0004-replica-machines-are-complete-transition-tables-with-tagged-results.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Measured every *Ports type in src/replica after TASK-115 (room-protocol 25, command-routing 24, generation-flow 23, roll-flow 17, catch-up-effects 15; one adapter each) and recorded the owner's 2026-11-20 decision to keep the four candidate modules separate. ADR-0004 now carries the numbers, the keep decision and the revisit condition: after the six edit-delivery tasks (TASK-125, 132, 103, 102, 106, 99) land. No code changed. Checks: backlog view/doctor, oxfmt touched-path check (Markdown skipped by .oxfmtrc.json), git diff --check.
<!-- SECTION:FINAL_SUMMARY:END -->
