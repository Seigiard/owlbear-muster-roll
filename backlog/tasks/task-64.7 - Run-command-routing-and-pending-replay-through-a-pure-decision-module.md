---
id: TASK-64.7
title: Run command routing and pending replay through a pure decision module
status: To Do
assignee: []
created_date: '2026-11-14T20:26:00Z'
updated_date: '2026-11-15T08:13:00Z'
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
The command/pending machine follows the TASK-64.4 map (`backlog/docs/doc-4 - TASK-64.4-Engine-state-machine-map-and-extraction-order.md`). Its closure symbols are `handleCommand`, `runCommand`, `handlePresetDiff`, `uploadPreset`, `handlePlayerCommand`, `queueIntent`, `pendingView`, `composedEntry`, `pendingViewRecords`, `replayPending`, `pendingIdsOf` and their qualified callbacks. It decides by explicit role, `importing` and catch-up-liveness context whether a command is applied, queued, proposed or rejected, and includes the preset diff/upload route. Use the ADR-0002 reducer shape for the route: explicit role/import/catch-up context in, a pure route decision out, effectful composer, pending, publisher and outbox calls in the engine or in the module's effectful loop. The preset batch (`uploadPreset`, the only place a mid-sequence write failure matters) and the pending replay may stay effectful loops that stop on the first failed write; a stepwise reducer that resumes from actual apply results is one allowed form, not a requirement. The retained `clearDeletedLinks` scene eligibility guard remains wiring and is exempt from the command-routing acceptance criterion; its submitted `link-clear` still enters the extracted command module, with scene wiring ownership preserved. The room-protocol/proposal symbols (`handleRoomMessage`, `dispatchRoomMessage`, `receiveProposal`, `receiveReject`, `receiveState`, `proposalContext`, `unlinkRemovedBlock`, `sendRoom`) remain in `startReplicaEngine` during TASK-64.7 and move in TASK-64.9 after it. TASK-64.7 is scoped to command/pending branches and must not require the later protocol extraction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pure module decides the route of every command type by role, import state and liveness, with unit tests per route; the preset batch and the pending replay may run as effectful loops in the module as long as a failed write stops the correct batch and the route decision stays pure; a stepwise reducer is allowed, not required
- [ ] #2 `startReplicaEngine` holds no command/pending decision branch on role, `importing` or liveness itself, except for the retained `clearDeletedLinks` scene eligibility guard; its `link-clear` submission enters the module while scene wiring remains in the engine. Protocol/admission branches may remain until TASK-64.9, as required by the TASK-64.4 extraction order
- [ ] #3 Every existing engine test passes unchanged
- [ ] #4 ARCHITECTURE-SPINE names the engine modules extracted so far in its replica row
- [ ] #5 The full check passes
<!-- AC:END -->
