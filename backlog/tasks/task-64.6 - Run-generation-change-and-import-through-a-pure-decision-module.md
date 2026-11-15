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
Generation/adoption is the riskiest state in the engine. The TASK-64.4 map assigns this task `handleSnapshotCheck`, `planImport`, `importFromSnapshot`, `wipeRoom`, `replaceGeneration`, `importSuperseded`, `saveGeneration`, `replaceReplica`, `adoptFromCopy`, `seeGeneration`, `dropPendingWork`, `stage`, `saveAdoptionData`, `performCaughtUp` and their qualified callbacks. These symbols share `importing`, `persistence`, `ownGeneration`, `highestSeenGeneration` and `incoming`, plus the AD-9 rule that no commit of a new generation leaves before the reset. The engine-side synchronous bridge requests pure generation decisions, executes storage/replacement effects synchronously, feeds actual success/failure results back into pure generation state, and returns the boolean result to the existing CatchUp callback; `false` keeps adoption open. The core remains pure; no Promise substitution. Generation-owned state changes arrive through `roleChanged`, `persistence-loaded` and `adoption-started` events; retained `changeRole` and `runCatchUp` forward those events instead of mutating generation state directly. Keep local import/wipe as `save → replace → writeImport → reset`, and remote adoption as `save → replace → roomCopy.replaced`, with no `writeImport` or `reset` in the remote path. Use catch-up-style decisions and keep the TASK-63.2 `RoomCopy` and TASK-63.3 `CatchUp` interfaces; `runCatchUp` remains the engine's effect interpreter for this slice. `deferred-work.md` records races here that have no test (a generation that never completes, the late `snapshot-imported`). A pure decision boundary makes those races unit-testable. Where TASK-63.3 already covers an adoption race, this task reuses that test instead of adding a second one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pure module owns the generation state and decides adoption, import, wipe and supersession from explicit inputs, returning effects as data. The engine-side synchronous bridge requests those pure decisions, executes storage/replacement effects synchronously, feeds actual success/failure results back into pure generation state, and returns the boolean result to the existing CatchUp callback; `false` keeps adoption open. The core remains pure with no Promise substitution, and the bridge distinguishes local `save → replace → writeImport → reset` from remote `save → replace → roomCopy.replaced`.
- [ ] #2 The mapped generation/adoption functions and their callbacks are gone and the engine only executes decisions; `runCatchUp` remains the retained CatchUp effect interpreter named by TASK-64.4
- [ ] #3 Every existing engine generation and snapshot test passes unchanged
- [ ] #4 The full check passes
- [ ] #5 Unit tests cover the AD-9 gate, supersession by a higher generation and the late `snapshot-imported` without a room rig; adoption races already covered by TASK-63.3 are referenced, not duplicated
<!-- AC:END -->
