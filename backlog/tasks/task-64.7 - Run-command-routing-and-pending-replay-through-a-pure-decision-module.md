---
id: TASK-64.7
title: Run command routing and pending replay through a pure decision module
status: To Do
assignee: []
created_date: '2026-11-14T20:26:00Z'
updated_date: '2026-11-15T06:21:00Z'
labels:
  - architecture
  - replica
dependencies:
  - TASK-64.6
parent_task_id: TASK-64
type: task
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The command path (`handleCommand`, `runCommand`, `handlePlayerCommand`, `queueIntent`, `replayPending`, `pendingView`) decides by role, `importing` and catch-up liveness whether a command is applied, queued, proposed or rejected. After the roll and generation machines are out, this is what remains of the closure that decides by role, and the last place the `role` variable is read in several command branches. With it extracted, `startReplicaEngine` is a wiring function for the machines the TASK-64.4 map names. The room-message dispatch (`dispatchRoomMessage`, the AD-5 gate) also branches on the sender's role and on liveness; whether it belongs to this task or to a task of its own is the map's call, so this task carries no line-count target.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pure module decides the route of every command type by role, import state and liveness, returning effects as data, with unit tests per route
- [ ] #2 `startReplicaEngine` holds no decision branch on role, `importing` or liveness itself: every such branch lives in a module the TASK-64.4 map names, and the function only wires modules to effects
- [ ] #3 Every existing engine test passes unchanged
- [ ] #4 ARCHITECTURE-SPINE names the engine modules in its replica row and the layer diagram matches the code
- [ ] #5 The full check passes
<!-- AC:END -->
