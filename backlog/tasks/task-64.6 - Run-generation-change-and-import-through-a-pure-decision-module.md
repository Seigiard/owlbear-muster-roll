---
id: TASK-64.6
title: Run generation change and import through a pure decision module
status: To Do
assignee: []
created_date: '2026-11-14T20:26:00Z'
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
Generation change is the riskiest state in the engine: `importFromSnapshot`, `wipeRoom`, `replaceGeneration`, `importSuperseded`, `saveGeneration`, `replaceReplica`, `adoptFromCopy`, `seeGeneration`, `dropPendingWork`, `stage`, `saveAdoptionData` and `performCaughtUp` share the `importing`, `ownGeneration` and `highestSeenGeneration` variables and the AD-9 rule that no commit of a new generation leaves before the reset. `deferred-work.md` records races here that have no test (a generation that never completes, the late `snapshot-imported`). A pure module makes those races unit-testable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pure module owns the generation state and decides adoption, import, wipe and supersession from explicit inputs, returning effects as data
- [ ] #2 Unit tests cover the AD-9 gate, supersession by a higher generation, the import that never completes and the late `snapshot-imported`, without a room rig
- [ ] #3 The generation functions nested in `startReplicaEngine` are gone and the engine only executes decisions
- [ ] #4 Every existing engine generation and snapshot test passes unchanged
- [ ] #5 The full check passes
<!-- AC:END -->
