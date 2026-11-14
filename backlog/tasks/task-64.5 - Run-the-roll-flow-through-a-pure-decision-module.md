---
id: TASK-64.5
title: Run the roll flow through a pure decision module
status: To Do
assignee: []
created_date: '2026-11-14T20:26:00Z'
labels:
  - architecture
  - replica
dependencies:
  - TASK-64.4
parent_task_id: TASK-64
type: task
ordinal: 81000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The roll flow in `src/replica/engine.ts` (`handleRollRequest`, `prepareRoll`, `rollWithDice`, `sendRoll`, `replyRoll`, `receiveRoll`, about 270 lines) is the most isolated engine machine: it reads role, preset and party, talks to the dice extension and the broadcast port, and answers the window. It is the probe for the engine extraction, the way the navigation pilot (TASK-61.5) was the probe for the UI. The spike before this task fixes the decision shape; this task applies it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pure module in `src/replica` decides every roll outcome (prepared, hidden, waiting-access, failures) from explicit inputs and returns effects as data; it imports nothing from platform adapters
- [ ] #2 The module has unit tests for each outcome without a room rig
- [ ] #3 `startReplicaEngine` only executes the decisions; the roll functions nested in the closure are gone
- [ ] #4 Every existing engine roll test passes unchanged
- [ ] #5 The full check passes
<!-- AC:END -->
