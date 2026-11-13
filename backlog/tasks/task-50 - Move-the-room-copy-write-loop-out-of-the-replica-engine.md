---
id: TASK-50
title: Move the room copy write loop out of the replica engine
status: Done
assignee:
  - '@claude'
created_date: '2026-11-12T02:11:00Z'
updated_date: '2026-11-13T07:22:00Z'
labels: []
dependencies:
  - TASK-48
references:
  - src/replica/engine.ts
  - src/core/snapshot.ts
priority: low
type: task
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The pure room copy parts already sit in `core/snapshot`, but `src/replica/engine.ts` holds the read, merge, write and verify loop: 12 `roomCopy*` variables (lines ~475-496) and `scheduleRoomCopy`, `writeRoomCopy`, `runRoomCopyWrite`, `verifyRoomCopyWrite`, `failRoomCopy`, `roomCopyStatus`, plus the import and wipe writes (`writeImportCopy`, `importCopyVerified`, `removeLowerCopy`). Tests for it (`engine-room-copy` 1212 lines, `engine-import` 1503, `engine-wipe` 525) all run through full engines, although the metadata port already has two adapters. Speculative: `canWriteRoomCopy` reads the role, catch-up state and `adoptTarget`, so the interface may come out nearly as wide as the code. Do it after the catch-up task, and drop it if the design pass shows no gain. Found in the architecture review of 2026-11-12 (candidate 6, Speculative).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A design pass decides whether a room copy module gets a smaller interface than the code it hides; if not, the task is archived with that reason
- [x] #2 If it goes ahead: the write loop, owed and rerun state and the status live in one module over the metadata port, tested with a fake metadata port
- [x] #3 Only the replica writes room metadata (AD-10); AD-8, AD-9 and AD-17 behavior is unchanged; the full check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Design pass (done): interface of 25 names over about 300 code lines; 10 of 16 room copy mutations survive the replica suite at a514082. Go ahead.
2. Wait for TASK-49; merge master; refresh the spec (Code Map lines, the change signal).
3. Phase A: move the loop, the import write, the catch-up read and the status into src/replica/room-copy.ts; junit list equals the baseline.
4. Phase B: room-copy.test.ts over the mock metadata port with a fault gate; every mutation fails a module test.
5. Phase C: retire engine tests a module test owns, each mapped.
6. Spine docs; full check; close.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Spec: _bmad-output/implementation-artifacts/spec-task-50-room-copy-module.md (draft, commit dbe5d12). Design-pass mutation probe at a514082 (bun test src/replica): R1, R2, R9, R12, R13, R16 killed; R3, R4, R5, R6, R7, R8, R10, R11, R14, R15 survive.

Built through bmad-build and the tdd chain (run dir ~/.claude/artifacts/tdd-20261113-053405/task-50-room-copy-module/). Phase A: the junit list equals the baseline; each of the 16 room copy mutations fails the same tests as at 17f80f3. Phase B: 39 module tests in room-copy.test.ts over the mock metadata port and a fault gate; at the final state each mutation fails at least one. Phase C: no engine test retired, as each also asserts engine wiring. One baseline defect fixed per the spec matrix row 'Import rerun': a trigger during a verified import write was lost. Deferred: an import keeps writing after its client loses the GM role (pre-existing; deferred-work.md).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The room copy now lives in src/replica/room-copy.ts: the AD-8 write loop, the catch-up read, the AD-9 import write, and their status and notices. The engine passes events and the gate; no engine code reads or writes room metadata any more. Every room copy rule has a module test that runs without an engine or timers; at the baseline 10 of 16 rule mutations went unnoticed, now all 16 fail a test. One behavior change: a trigger during a verified import write now runs one write after it (it was lost before). Full check: format, lint, typecheck, bun test 2785 pass, e2e 492 pass, build. Code review: 2 rounds; round 1 had 1 major and 6 minors, all fixed; round 2 clean. Follow-up: an import continues after its client loses the GM role (pre-existing, in deferred-work.md).
<!-- SECTION:FINAL_SUMMARY:END -->
