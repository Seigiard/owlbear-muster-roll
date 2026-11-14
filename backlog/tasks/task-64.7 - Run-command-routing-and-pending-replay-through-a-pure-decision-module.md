---
id: TASK-64.7
title: Run command routing and pending replay through a pure decision module
status: To Do
assignee: []
created_date: '2026-11-14T20:26:00Z'
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
The command path (`handleCommand`, `runCommand`, `handlePlayerCommand`, `queueIntent`, `replayPending`, `pendingView`) decides by role, `importing` and catch-up liveness whether a command is applied, queued, proposed or rejected. After the roll and generation machines are out, this is what remains of the closure and the last place the `role` variable is read in several branches. With it extracted, `startReplicaEngine` is a wiring function.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pure module decides the route of every command type by role, import state and liveness, returning effects as data, with unit tests per route
- [ ] #2 `startReplicaEngine` is under 600 lines and holds no decision branch on role, `importing` or liveness itself
- [ ] #3 Every existing engine test passes unchanged
- [ ] #4 ARCHITECTURE-SPINE names the engine modules in its replica row and the layer diagram matches the code
- [ ] #5 The full check passes
<!-- AC:END -->
