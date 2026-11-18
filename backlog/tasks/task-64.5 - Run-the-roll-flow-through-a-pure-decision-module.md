---
id: TASK-64.5
title: Extract the roll flow through an injected-port module
status: Done
assignee: []
created_date: '2026-11-14T20:26:00Z'
updated_date: '2026-11-15T09:46:00Z'
labels:
  - architecture
  - replica
dependencies:
  - TASK-64.4
parent_task_id: TASK-64
type: task
ordinal: 84000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The roll machine is the first extraction in the approved TASK-64.4 map (`backlog/docs/doc-4 - TASK-64.4-Engine-state-machine-map-and-extraction-order.md`). Its closure symbols are `handleRollRequest`, `prepareRoll`, `rollWithDice`, `sendRoll`, `replyRoll`, `receiveRoll` and their qualified callbacks. It reads role, the pending-view/preset resolver, party GM presence and player identity, and uses the existing dice-extension and broadcast ports. This task extracts an injected-port module: the module owns roll preparation, hidden/refused and waiting-access outcomes, local fallback and failures, plus the asynchronous dice/send pipeline; it imports no platform adapter. Inject live getters and read them at the existing source points: `stopped` before readiness, `role` and `stopped` across readiness and the dice wait, `role` before send, the current generation while constructing the message, and `stopped` after the reported send. Preserve `hidden` as a once-computed preparation value and add no new guards. Keep the shared `presetOf` cache and `gmInRoom` helper as injected engine wiring; do not duplicate either cache or introduce a shared machine runtime.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A `src/replica` module owns every roll outcome (prepared, hidden/refused, waiting-access, local fallback and failures) and the asynchronous dice/send pipeline from explicit inputs, using injected ports/callbacks; it reads the live stopped/role/generation getters at the existing readiness, dice-wait, pre-send, message-construction and reported-send points; it keeps hidden once-computed; it imports no platform adapter
- [x] #2 The module has unit tests for each outcome without a room rig
- [x] #3 `startReplicaEngine` only wires the module to its injected ports/callbacks; the roll pipeline and outcome branches are no longer nested in the closure
- [x] #4 Every existing engine roll test passes unchanged
- [x] #5 The full check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract the roll flow into a platform-free injected-port module and preserve the existing engine behavior and live getter read points.
2. Add module-level unit tests for each roll outcome without the room rig; preserve all engine roll tests unchanged.
3. Run focused and full project checks, including browser tests and build, then record verification evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Extracted src/replica/roll-flow.ts and wired live engine getters without duplicating presetOf or gmInRoom. Existing engine tests are byte-identical to the epic base. Validated at fd9c3f36b1341ccd0c58caaf02d4d00b81dc56d4; integrated source/tests match that state. Focused tests: 97 pass; full Bun: 3045 pass, 1 skip; Chromium: 521 pass; format, lint, typecheck and build exit 0. Fifteen faithful roll mutations failed their behavior assertions, including corrected stopped-check observations. Raw evidence: /Users/seigiard/.claude/artifacts/implement-spec-64-20261115/64.5/controls/ and replay-1/. One closing epic review remains.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Roll preparation, dice waits, send outcomes and receive notifications now live in an injected-port module. Independent unit tests cover outcomes and live state reads; unchanged engine tests and the full check pass. No live Owlbear host behavior is claimed.
<!-- SECTION:FINAL_SUMMARY:END -->
