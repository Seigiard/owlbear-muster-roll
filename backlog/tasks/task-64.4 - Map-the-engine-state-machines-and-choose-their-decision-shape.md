---
id: TASK-64.4
title: Map the engine state machines and choose their decision shape
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-14T20:25:00Z'
updated_date: '2026-11-15T08:13:00Z'
labels:
  - architecture
  - replica
dependencies:
  - TASK-64.3
  - TASK-63.2
  - TASK-63.3
documentation:
  - _bmad-output/implementation-artifacts/spec-task-64.4-engine-state-map.md
  - backlog/docs/doc-4 - TASK-64.4-engine-state-map-and-extraction-order.md
parent_task_id: TASK-64
type: spike
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`startReplicaEngine` in `src/replica/engine.ts` spans lines 210-2562. The complete compiler-AST inventory is 160 nested functions (including callbacks) and 26 `let` declarations. Those symbols hold role, generation, import state, catch-up, held open requests and roll state. All of it is tested only through full room simulation. `src/replica/catch-up.ts` (TASK-48) already shows the shape that works here: a pure module returns a decision as data and `runCatchUp` executes it. Before cutting the engine, one spike maps which state belongs to which machine, where the machines touch, and whether the catch-up shape, the ADR-0002 reducer shape or an injected-port module fits each. The map is recorded in `backlog/docs/doc-4 - TASK-64.4-Engine-state-machine-map-and-extraction-order.md` and adds the room-protocol follow-up TASK-64.9. It writes no production code. It waits for TASK-63.2 (room-copy write phases) and TASK-63.3 (catch-up and adoption phases), because both reshape the state the generation machine reads; the map is drawn over their finished state, and TASK-63 AC#4 (no shared state-machine runtime) binds the shape chosen here.

Validation on 2026-11-15 added two facts the map covers. First, `src/replica` already uses a third shape beside the two above: a module with injected ports and callbacks, as `room-copy.ts`, `pending-edits.ts` and `dice-extension.ts` do. For a linear async pipeline such as the roll (read name, send to dice extension, wait for the result, send) that shape is simpler than a decision list, so the spike weighs all three. Second, the three planned machines leave a room-protocol/proposal machine outside their boundaries: `handleRoomMessage`, `dispatchRoomMessage`, `receiveProposal`, `receiveReject`, `receiveState`, `proposalContext`, `unlinkRemovedBlock` and `sendRoom`. The map assigns those symbols to TASK-64.9. Token menu, open requests, scene watch, timer interpretation and `runCatchUp` remain explicitly retained wiring around existing modules.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A document under `backlog/docs` lists every `let` and every nested function of `startReplicaEngine` grouped into machines, with the state each machine owns and the effects it needs
- [x] #2 For each machine the document names the decision shape (catch-up style decisions, ADR-0002 reducer, or a module with injected ports as `room-copy` and `pending-edits` use) and the reason
- [x] #3 The extraction tasks under TASK-64 are re-ordered, re-scoped or added in backlog from the map, with their descriptions updated; every nested function outside the mapped machines is named as wiring or gets a task
- [x] #4 The owner confirms the map before the first extraction starts
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Complete repository context and inventory current startReplicaEngine, including all mutable locals and nested functions.
2. Write _bmad-output/implementation-artifacts/spec-task-64.4-engine-state-map.md as a dispatch plan and stop at the BMAD checkpoint for owner approval.
3. After the planning spec is approved, create the exhaustive backlog document, reconcile an independent AST inventory, and update TASK-64 extraction tasks through the Backlog CLI.
4. Record the owner decision before TASK-64.5 starts and validate documentation coverage; do not change production or test code.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-15: Owner explicitly answered “Подтвердить карту” after reading the doc-4 link, the 160-function/26-let inventory, all four shapes, the roll injected-port versus pure tradeoff, and extraction order TASK-64.5 → TASK-64.6 → TASK-64.7 → TASK-64.9. This confirms the map and permits the extraction order; it does not start TASK-64.5. Evidence is recorded in doc-4 with status confirmed-owner-approved. The source/inventory and map-coverage controls remain unchanged and previously passed.

Final documentary verification: Babel and OXC independently reconcile all 160 nested functions and 26 let bindings, and the map has no missing or duplicate ownership rows. The three BMAD lenses completed; eight source-grounded documentary findings and validation corrections were fixed. A fresh confirming prose review returned no findings or open questions. Nothing is deferred. Runtime checks were not run under the owner-approved documentation-only exception; production and test code are unchanged. TASK-64.5 was not started.

2026-11-15, later: the owner reopened the generation/adoption shape after an architecture validation and chose the injected-port module (as room-copy and pending-edits) over catch-up-style decisions; performCaughtUp moved to retained wiring. doc-4 carries the revision; TASK-64.6 is updated. The rest of the map and its confirmation stand.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Mapped every nested function and let in startReplicaEngine to four modules or explicit retained wiring in doc-4. Selected injected-port roll/protocol modules, catch-up-style generation decisions and a command reducer; aligned TASK-64 and TASK-64.5 through TASK-64.7, and added TASK-64.9. The owner confirmed the map before extraction. Independent AST/document reconciliation and confirming review passed with no remaining or deferred findings. No production or test code changed; full runtime checks were intentionally not run under the approved documentary-validation exception.
<!-- SECTION:FINAL_SUMMARY:END -->
