---
id: TASK-64.7
title: Run command routing and pending replay through a pure decision module
status: Done
assignee: []
created_date: '2026-11-14T20:26:00Z'
updated_date: '2026-11-15T13:39:00Z'
labels:
  - architecture
  - replica
dependencies:
  - TASK-64.6
parent_task_id: TASK-64
type: task
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The command/pending machine follows the TASK-64.4 map (`backlog/docs/doc-4 - TASK-64.4-Engine-state-machine-map-and-extraction-order.md`). Its closure symbols are `handleCommand`, `runCommand`, `handlePresetDiff`, `uploadPreset`, `handlePlayerCommand`, `queueIntent`, `pendingView`, `composedEntry`, `pendingViewRecords`, `replayPending`, `pendingIdsOf` and their qualified callbacks. It decides by explicit role, `importing` and catch-up-liveness context whether a command is applied, queued, proposed or rejected, and includes the preset diff/upload route. Use the ADR-0002 reducer shape for the route: explicit role/import/catch-up context in, a pure route decision out, effectful composer, pending, publisher and outbox calls in the engine or in the module's effectful loop. The preset batch (`uploadPreset`, the only place a mid-sequence write failure matters) and the pending replay may stay effectful loops that stop on the first failed write; a stepwise reducer that resumes from actual apply results is one allowed form, not a requirement. The retained `clearDeletedLinks` scene eligibility guard remains wiring and is exempt from the command-routing acceptance criterion; its submitted `link-clear` still enters the extracted command module, with scene wiring ownership preserved. The room-protocol/proposal symbols (`handleRoomMessage`, `dispatchRoomMessage`, `receiveProposal`, `receiveReject`, `receiveState`, `proposalContext`, `unlinkRemovedBlock`, `sendRoom`) remain in `startReplicaEngine` during TASK-64.7 and move in TASK-64.9 after it. TASK-64.7 is scoped to command/pending branches and must not require the later protocol extraction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A pure module decides the route of every command type by role, import state and liveness, with unit tests per route; the preset batch and the pending replay may run as effectful loops in the module as long as a failed write stops the correct batch and the route decision stays pure; a stepwise reducer is allowed, not required
- [x] #2 `startReplicaEngine` holds no command/pending decision branch on role, `importing` or liveness itself, except for the retained `clearDeletedLinks` scene eligibility guard; its `link-clear` submission enters the module while scene wiring remains in the engine. Protocol/admission branches may remain until TASK-64.9, as required by the TASK-64.4 extraction order
- [x] #3 Every existing engine test passes unchanged
- [x] #4 ARCHITECTURE-SPINE names the engine modules extracted so far in its replica row
- [x] #5 The full check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract a command-routing module with pure explicit-context route decisions and injected effect ports.
2. Keep scene eligibility in engine wiring while routing link-clear through the module.
3. Add unit or seam tests, calibrate them, then run the required checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Worker validation passed on 6320626379b20af0c0d69fbd659f8a5272921338.
Pure command routing and real pending replay are covered by calibrated module tests.
Full unit suite: 3065 pass, 1 skip, 0 fail. Browser suite: 521 passed with Node 22.
Awaiting parent acceptance, tracker finalization, and integration merge.

Caller accepted and integrated unchanged source 6320626379b20af0c0d69fbd659f8a5272921338 (ticket metadata successor 0dd552027ba292beac4c06f46906dc43114eeb30). Pure route decisions preserve player priority and preset-diff import behavior; actual production replay preserves partial-batch continuation and updated context. Removed the unused generic replay surrogate and unsafe cast. All 15 module tests have observed behavior-red evidence through nine faithful saved mutations in calibration-3/4; initial missing-module failure is explicitly not treated as behavioral red. Existing engine tests and CatchUp/RoomCopy interfaces are unchanged. Full check: 3065 pass, 1 skip, 0 fail; Node 22 browser 521 pass; format/lint/typecheck/build exit 0. Raw logs: /Users/seigiard/.claude/artifacts/implement-spec-64-20261115/64.7/. Spine names all three modules extracted so far. One closing epic review remains.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Command and preset routes now use pure explicit-context decisions, while preset batches and actual pending replay run through injected module ports. Scene eligibility stays in engine wiring. Independent tests cover real production replay rather than a surrogate; unchanged engine tests and full checks pass.
<!-- SECTION:FINAL_SUMMARY:END -->
