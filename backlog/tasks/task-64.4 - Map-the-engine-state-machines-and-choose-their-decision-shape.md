---
id: TASK-64.4
title: Map the engine state machines and choose their decision shape
status: To Do
assignee: []
created_date: '2026-11-14T20:25:00Z'
updated_date: '2026-11-14T20:34:00Z'
labels:
  - architecture
  - replica
dependencies:
  - TASK-64.3
  - TASK-63.2
  - TASK-63.3
parent_task_id: TASK-64
type: spike
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`startReplicaEngine` in `src/replica/engine.ts` is one closure of about 2350 lines with 79 nested functions and 21 mutable `let` variables that together hold role, generation, import state, catch-up, held open requests and roll state. All of it is tested only through full room simulation. `src/replica/catch-up.ts` (TASK-48) already shows the shape that works here: a pure module returns a decision as data and `runCatchUp` executes it. Before cutting the engine, one spike maps which state belongs to which machine, where the machines touch, and whether the catch-up shape or the ADR-0002 reducer shape fits each. The spike produces the map and the order of the three extraction tasks that follow; it writes no production code. It waits for TASK-63.2 (room-copy write phases) and TASK-63.3 (catch-up and adoption phases), because both reshape the state the generation machine reads; the map is drawn over their finished state, and TASK-63 AC#4 (no shared state-machine runtime) binds the shape chosen here.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A document under `backlog/docs` lists every `let` and every nested function of `startReplicaEngine` grouped into machines, with the state each machine owns and the effects it needs
- [ ] #2 For each machine the document names the decision shape (catch-up style decisions or ADR-0002 reducer) and the reason
- [ ] #3 The three extraction tasks (rolls, generation change, command routing) are re-ordered or re-scoped in backlog from the map, with their descriptions updated
- [ ] #4 The owner confirms the map before the first extraction starts
<!-- AC:END -->
