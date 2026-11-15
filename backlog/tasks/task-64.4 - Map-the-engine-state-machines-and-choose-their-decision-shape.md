---
id: TASK-64.4
title: Map the engine state machines and choose their decision shape
status: To Do
assignee: []
created_date: '2026-11-14T20:25:00Z'
updated_date: '2026-11-15T06:21:00Z'
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
`startReplicaEngine` in `src/replica/engine.ts` is one closure of about 2450 lines with 88 nested functions and 27 mutable `let` variables that together hold role, generation, import state, catch-up, held open requests and roll state. All of it is tested only through full room simulation. `src/replica/catch-up.ts` (TASK-48) already shows the shape that works here: a pure module returns a decision as data and `runCatchUp` executes it. Before cutting the engine, one spike maps which state belongs to which machine, where the machines touch, and whether the catch-up shape or the ADR-0002 reducer shape fits each. The spike produces the map and the order of the three extraction tasks that follow; it writes no production code. It waits for TASK-63.2 (room-copy write phases) and TASK-63.3 (catch-up and adoption phases), because both reshape the state the generation machine reads; the map is drawn over their finished state, and TASK-63 AC#4 (no shared state-machine runtime) binds the shape chosen here.

Validation on 2026-11-15 added two facts the map must cover. First, `src/replica` already uses a third shape beside the two above: a module with injected ports and callbacks, as `room-copy.ts`, `pending-edits.ts` and `dice-extension.ts` do. For a linear async pipeline such as the roll (read name, send to dice extension, wait for the result, send) that shape is simpler than a decision list, so the spike weighs all three. Second, the three planned machines cover about 960 lines (roll about 270, generation about 480, command routing about 210); about 1480 lines stay in the closure, among them `dispatchRoomMessage` (about 280 lines, the AD-5 gate, which branches on the sender's role and on catch-up liveness), `receiveProposal` with its reject path (about 160), preset upload and diff (about 140), token menu, open requests and scene watch (about 200) and `runCatchUp` (about 130). The map assigns each of these to a machine or names it as wiring, and adds extraction tasks under TASK-64 where a machine falls outside the three.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A document under `backlog/docs` lists every `let` and every nested function of `startReplicaEngine` grouped into machines, with the state each machine owns and the effects it needs
- [ ] #2 For each machine the document names the decision shape (catch-up style decisions, ADR-0002 reducer, or a module with injected ports as `room-copy` and `pending-edits` use) and the reason
- [ ] #3 The extraction tasks under TASK-64 are re-ordered, re-scoped or added in backlog from the map, with their descriptions updated; every nested function outside the mapped machines is named as wiring or gets a task
- [ ] #4 The owner confirms the map before the first extraction starts
<!-- AC:END -->
