---
id: TASK-64.9
title: Extract room protocol admission and proposal handling
status: Done
assignee:
  - '@seigiard'
created_date: '2026-11-15T00:00:00Z'
updated_date: '2026-11-15T15:27:00Z'
labels:
  - architecture
  - replica
  - protocol
dependencies:
  - TASK-64.7
  - TASK-64.3
parent_task_id: TASK-64
type: task
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TASK-64.4 engine map assigns the room-protocol/proposal machine to this task: `handleRoomMessage`, `dispatchRoomMessage`, `receiveProposal`, `receiveReject`, `receiveState`, `proposalContext`, `unlinkRemovedBlock`, `sendRoom` and their qualified callbacks. The machine owns the AD-5 admission boundary and the sender/generation/liveness routing around the existing `party-roster`, `CatchUp`, `core/access` and record-store seams. It owns the `roomMessages` promise, sequencing and recovery callbacks, including the nested `.then` at engine line 2466 and `.catch` at lines 2467-2469; the engine retains only the outer `onMessage` subscription forwarding callback at lines 2464-2470. It also owns the serialized room-message ingress adapter; it must not duplicate CatchUp or introduce a shared state-machine runtime. Use injected ports/callbacks because sender lookup and message handling are an asynchronous protocol adapter, not one pure synchronous reducer. The map leaves token menu, open requests, scene watch, timer interpretation and `runCatchUp` as retained wiring.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A replica module owns the AD-5 admission and room-message dispatch decisions from explicit sender, role and generation inputs, with injected party and CatchUp seams and no platform-adapter imports
- [x] #2 Proposal, reject, state and roll routing move out of `startReplicaEngine`; the engine only executes the injected protocol effects
- [x] #3 AD-5 remains one gate, and TASK-63.3 `CatchUp` plus existing party-roster interfaces remain unchanged
- [x] #4 Existing engine sync, proposal, state, liveness and roll tests pass unchanged
- [x] #5 The full check passes
- [x] #6 The extracted module has independent unit tests for the existing sender-lookup arrival order, error continuation, and AD-5 admission rejects without handler effects; TASK-64.4 authors no tests
- [x] #7 ARCHITECTURE-SPINE names every engine module in its replica row and the layer table and diagram match the code, because this is the last engine extraction before the epic closes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract the serialized room-protocol adapter into the engine-wired replica module; retain only the outer broadcast forwarding callback. 2. Exercise real receive with delayed lookup, handler failure, parse-valid rejected messages and nearby admitted controls; keep the full AD-5 decision table in its unchanged core owner. 3. Calibrate every observable module assertion with faithful saved mutations, then run source, browser, build, format, backlog and architecture checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
This task starts only after the owner confirms the TASK-64.4 map and TASK-64.5 through TASK-64.7 finish in order. The qualified callback inventory and exact line spans are in the map. `roomMessages` is the only closure `let` assigned to this machine; it serializes ingress and is an adapter concern, not durable machine state. The nested `.then` and `.catch` callbacks at lines 2466-2469 move with that promise; only the outer subscription forwarding callback remains in engine wiring. The independent unit-test criterion preserves the current sender-lookup arrival order, error continuation and admission-reject/no-handler-effects behavior without adding guards.

Caller accepted and integrated final lock/tip 44c1a2fece4ee1e9e662c7cd597a121a29bf510d. Production uses direct core parser/relation and one AD-5 gate; exact generation/adoption, liveness, dispatch and serialized recovery order are preserved. Original engine tests, CatchUp, RoomCopy and party-roster interfaces remain unchanged. All 42 direct owners have saved assertion-red/restored-green evidence through four faithful mutations. Fourteen redundant no-op matrix rows stayed green with the claimed defect and were retired from module tests; their named unchanged core AD-5 table owners retain the decision coverage. Full Bun 3107 pass/1 skip, Chromium 521 pass, types/build/backlog pass; final exact-byte format/lint and combined protocol/core check (179 pass) supersede the recorded initial whitespace failure. Evidence: /Users/seigiard/.claude/artifacts/implement-spec-64-20261115/64.9/. Architecture spine lists all four extracted modules. Final integrated checks/review remain caller-owned; the separate stale M2 mutation fixture repair is not part of this ticket checkout.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Room traffic now enters one independently tested serialized module for parsing, sender lookup, generation adoption, admission and dispatch. The engine retains lifecycle and effect wiring. Direct tests preserve arrival order, error continuation and observable rejection effects; unchanged core tests retain the complete admission table. Required checks pass; live Owlbear host behavior remains outside automated evidence.
<!-- SECTION:FINAL_SUMMARY:END -->
