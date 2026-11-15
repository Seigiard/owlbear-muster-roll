---
id: TASK-64.6
title: Extract generation change and import through an injected-port module
status: Done
assignee:
  - '@seigiard'
created_date: '2026-11-14T20:26:00Z'
updated_date: '2026-11-15T12:07:00Z'
labels:
  - architecture
  - replica
dependencies:
  - TASK-64.5
parent_task_id: TASK-64
type: task
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Generation/adoption is the riskiest state in the engine. The TASK-64.4 map (`backlog/docs/doc-4 - TASK-64.4-Engine-state-machine-map-and-extraction-order.md`) assigns this task `handleSnapshotCheck`, `planImport`, `importFromSnapshot`, `wipeRoom`, `replaceGeneration`, `importSuperseded`, `saveGeneration`, `replaceReplica`, `adoptFromCopy`, `seeGeneration`, `dropPendingWork`, `stage`, `saveAdoptionData` and their qualified callbacks; `performCaughtUp` stays retained wiring. These symbols share `importing`, `persistence`, `ownGeneration`, `highestSeenGeneration` and `incoming`, plus the AD-9 rule that no commit of a new generation leaves before the reset.

On 2026-11-15 the owner reopened the shape and chose an injected-port module, like `room-copy` and `pending-edits`, over catch-up-style decisions: the pure decisions are four predicates (next generation, schema check, `importSuperseded`, generation relation) and live as small pure functions, while the two effect sequences stay linear code over injected ports. Inject the record store or its absence, the room copy, the CatchUp seams (`adopting`, `replicaReplaced`, `generationRead`, `generationHeard`, `adoptionStaged`), outbox flush, remote send, replica swap, pending-work drop, notices, window replies, `connectionId` and a `stopped` getter. Expose `generation()`, `highestSeen()`, `importing()` and `persistence()` for the engine's readers (outbox, proposals, rolls, relation, `runCatchUp`), and `importFromSnapshot`, `wipe`, `checkSnapshot`, `adoptFromCopy`, `seeGeneration`, `stage`, `clearStaged`, `saveAdoption` and `roleChanged`. Keep local import/wipe as `flush → save → replace → writeImport → reset` and remote adoption as `save → replace → roomCopy.replaced`, with no `writeImport` or `reset` in the remote path. `saveAdoption` stays the synchronous callback CatchUp calls, and `false` keeps adoption open. `runCatchUp` remains the only CatchUp effect interpreter and calls the module; no generation interpreter and no shared state-machine runtime. Keep the TASK-63.2 `RoomCopy` and TASK-63.3 `CatchUp` interfaces. `deferred-work.md` records races here that have no test (a generation that never completes, the late `snapshot-imported`); fake store, room-copy and CatchUp seams make them unit-testable by call order, as `room-copy.test.ts` does for its port. Where TASK-63.3 already covers an adoption race, reuse that test instead of adding a second one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A `src/replica` module owns the generation state (`persistence`, `ownGeneration`, `highestSeenGeneration`, `incoming`, `importing`) and the import, wipe, snapshot-check, adoption-staging and supersession paths over injected ports and callbacks; the four predicates (next generation, schema check, `importSuperseded`, generation relation) are pure functions; it imports no platform adapter; it keeps local `flush → save → replace → writeImport → reset` and remote `save → replace → roomCopy.replaced`, and its synchronous `saveAdoption` returns `false` to keep adoption open
- [x] #2 The mapped generation/adoption functions and their callbacks are gone from `startReplicaEngine`; the engine reads generation state only through the module getters, `changeRole` hands the module its re-read store through `roleChanged`, `performCaughtUp` stays wiring, and `runCatchUp` stays the only CatchUp effect interpreter
- [x] #3 Every existing engine generation and snapshot test passes unchanged
- [x] #4 The full check passes
- [x] #5 Unit tests on fake store, room-copy and CatchUp seams cover, without a room rig: the AD-9 call order (no `reset` before a complete save and `writeImport`, commits flushed before the save), supersession by a higher generation during `writeImport` (`data-replaced`, no `reset`), a failed save that removes the part saved and leaves adoption open, and the late `snapshot-imported`; adoption races already covered by TASK-63.3 are referenced, not duplicated
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Expose the injected generation/adoption module through a bounded behavior-preserving extraction, using existing engine import, wipe and catch-up scenarios as the first oracle because a missing-module import is not a behavioral red.
2. Lock independent module tests on fake store, RoomCopy and CatchUp ports for the documented AD-9 order, failed-save, supersession and late snapshot-imported cases; calibrate them with faithful mutations.
3. Wire retained engine lifecycle and CatchUp through the module getters and operations without changing protected interfaces, then run the locked module tests, unchanged engine generation/snapshot tests, and the full source/test check set.
4. Record command evidence and objective completion through Backlog.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Exposure extraction commit `95138bb673be79bfc1f9da2c94d8c7ac7773b82c` preserved existing engine scenarios and passed full checks: exposure 87/87, unit 3045 passed (1 skipped), browser 521 passed, format/lint/typecheck/build exit 0. Raw logs: `/Users/seigiard/.claude/artifacts/implement-spec-64-20261115/64.6/controls/`. TDD is blocked before the required module-test lock and calibration: implementer-1 did not publish its required report after one resume (D1 returned); parent must choose recovery.

D1 is resolved: recovered the handoff, locked independent module tests, corrected the room-copy adoption ordering under a real CatchUp control, and calibrated all five module scenarios. Final source 2dfa47aa6f02b38407bf3a3b3cc05a60ec289545 is integrated unchanged. Module tests: 5 pass; unchanged engine import/wipe/catch-up tests: 87 pass; full Bun: 3050 pass, 1 skip, 0 fail; format/lint/typecheck/build exit 0. Browser recovery on CI-compatible Node 22.19.0: 521 pass, exit 0; the earlier Node 26 V8 abort was a local runtime fault. Exact raw evidence and five saved mutation patch/log pairs are under /Users/seigiard/.claude/artifacts/implement-spec-64-20261115/64.6/. Original engine tests, CatchUp and RoomCopy are byte-identical to the epic base. TASK-63.3 adoption-race tests are reused; no new live-host guarantee is claimed. One closing epic review remains.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Generation state, import/wipe, snapshot checks and adoption now live behind injected ports. Local and remote AD-9 order remains intact, including synchronous failed adoption and delayed import completion. Five unit scenarios and faithful mutations cover the extracted boundary; unchanged engine tests and the full check pass.
<!-- SECTION:FINAL_SUMMARY:END -->
