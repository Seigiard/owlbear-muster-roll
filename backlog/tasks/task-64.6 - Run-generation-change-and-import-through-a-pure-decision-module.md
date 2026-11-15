---
id: TASK-64.6
title: Run generation change and import through a pure decision module
status: To Do
assignee: []
created_date: '2026-11-14T20:26:00Z'
updated_date: '2026-11-14T20:34:00Z'
labels:
  - architecture
  - replica
dependencies:
  - TASK-64.5
parent_task_id: TASK-64
type: task
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Generation change is the riskiest state in the engine: `importFromSnapshot`, `wipeRoom`, `replaceGeneration`, `importSuperseded`, `saveGeneration`, `replaceReplica`, `adoptFromCopy`, `seeGeneration`, `dropPendingWork`, `stage`, `saveAdoptionData` and `performCaughtUp` share the `importing`, `ownGeneration` and `highestSeenGeneration` variables and the AD-9 rule that no commit of a new generation leaves before the reset. `deferred-work.md` records races here that have no test (a generation that never completes, the late `snapshot-imported`). A pure module makes those races unit-testable. TASK-63.2 and TASK-63.3 land first: they make the write phases inside `RoomCopy` and the adoption phases inside `CatchUp` explicit without moving ownership. This task moves the engine-side orchestration around those two modules and must keep their phase models and their interfaces; where TASK-63.3 already covers an adoption race, this task reuses that test instead of adding a second one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pure module owns the generation state and decides adoption, import, wipe and supersession from explicit inputs, returning effects as data
- [ ] #2 The generation functions nested in `startReplicaEngine` are gone and the engine only executes decisions
- [ ] #3 Every existing engine generation and snapshot test passes unchanged
- [ ] #4 The full check passes
- [ ] #5 Unit tests cover the AD-9 gate, supersession by a higher generation and the late `snapshot-imported` without a room rig; adoption races already covered by TASK-63.3 are referenced, not duplicated
<!-- AC:END -->
