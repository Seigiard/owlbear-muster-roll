---
id: TASK-64.5
title: Extract the roll flow through an injected-port module
status: To Do
assignee: []
created_date: '2026-11-14T20:26:00Z'
updated_date: '2026-11-15T07:13:00Z'
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
The roll machine is the first extraction in the approved TASK-64.4 map (`backlog/docs/doc-4 - TASK-64.4-engine-state-map-and-extraction-order.md`). Its closure symbols are `handleRollRequest`, `prepareRoll`, `rollWithDice`, `sendRoll`, `replyRoll`, `receiveRoll` and their qualified callbacks. It reads role, the pending-view/preset resolver, party GM presence and player identity, and uses the existing dice-extension and broadcast ports. This task extracts an injected-port module: the module owns roll preparation, hidden/refused and waiting-access outcomes, local fallback and failures, plus the asynchronous dice/send pipeline; it imports no platform adapter. Inject live getters and read them at the existing source points: `stopped` before readiness, `role` and `stopped` across readiness and the dice wait, `role` before send, the current generation while constructing the message, and `stopped` after the reported send. Preserve `hidden` as a once-computed preparation value and add no new guards. Keep the shared `presetOf` cache and `gmInRoom` helper as injected engine wiring; do not duplicate either cache or introduce a shared machine runtime.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A `src/replica` module owns every roll outcome (prepared, hidden/refused, waiting-access, local fallback and failures) and the asynchronous dice/send pipeline from explicit inputs, using injected ports/callbacks; it reads the live stopped/role/generation getters at the existing readiness, dice-wait, pre-send, message-construction and reported-send points; it keeps hidden once-computed; it imports no platform adapter
- [ ] #2 The module has unit tests for each outcome without a room rig
- [ ] #3 `startReplicaEngine` only wires the module to its injected ports/callbacks; the roll pipeline and outcome branches are no longer nested in the closure
- [ ] #4 Every existing engine roll test passes unchanged
- [ ] #5 The full check passes
<!-- AC:END -->
