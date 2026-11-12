---
id: TASK-47
title: Share one room test rig across the engine tests
status: Done
assignee:
  - '@claude'
created_date: '2026-11-12T02:11:00Z'
updated_date: '2026-11-12T07:19:00Z'
labels: []
dependencies: []
references:
  - src/replica
  - tests/support/room.ts
priority: medium
type: task
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Each of the 18 `src/replica/engine-*.test.ts` files wires the mock platform, the bus, the send queue, the engine, the projection store and the window client by hand. `startClient` is defined in 16 files, `createBacking` in 17, `openRoom` in 14, and a full `TIMING` literal in 21 test files. 15 files seed state by writing raw localStorage keys, so the AD-11 key format is known to tests. Waiting is real time: 678 `waitUntil` and 152 `pause` calls, with no fake clock in `src`. E2E tests already share `tests/support/room.ts`; unit tests do not. A shared rig is also what the pending edit, catch-up and projection tasks need to move tests onto smaller surfaces. Found in the architecture review of 2026-11-12 (candidate 3, Strong). Read `~/.claude/shared/testing.md` before designing it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One shared test module builds a room with GM and player clients on the mock adapter, and every engine test file uses it instead of its own wiring
- [x] #2 Tests seed a room with records, not storage keys; the AD-11 key format appears in no test file outside the rig
- [x] #3 Default timing lives in the rig; a test states only the timings it changes
- [x] #4 Every test that passed before still passes with the same assertions; no test is skipped or weakened
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Spec: _bmad-output/implementation-artifacts/spec-task-47-shared-engine-test-rig.md (rig API, timing deltas, rules).
2. Add src/replica/room-rig.ts (rooms, GM and player clients, default timing, AD-11 key format, shared helpers); export createMemoryBacking from the mock.
3. Move the 18 engine test files onto the rig in slices; compare each slice with the junit baseline (658 tests, 662 assertions).
4. Prove no weakening: same test names and per-test assertion counts; mutations in engine.ts turn the same tests red before and after.
5. Review, full check, merge master, full check again.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence on 5cef374 (branch merged with master 20ff294):
- AC1: src/replica/room-rig.ts builds rooms with GM and player clients on the mock adapter. rg for createMockPlatform, createSendQueue, startReplicaEngine, startReplicaClient, createProjectionStore and createBacking in src/replica/engine-*.test.ts finds nothing.
- AC2: no mr1:/mr2: string in any engine test file; keys come from the rig's storageKey, and the rig writes the AD-11 format as its own literal (no storage-key.ts import). Scope is the engine tests, as the title and spec say. The format stays where it is the subject or another support module: storage-key.test.ts, record-store.test.ts, mock/index.test.ts, and the e2e files through tests/support/room.ts.
- AC3: RIG_TIMING holds the default; engine files state only their deltas, and their effective timing equals the base for all 18 files. Four non-engine test files keep a full Timing literal (deferred-work.md).
- AC4: the junit list of the 18 files equals the base (658 tests, 662 assertions, same per-test counts, nothing skipped). Per-file wait limits equal the base. Mutations (storage key format, 20x catch-up timeout, silent denied proposal) kill the same tests per file before and after.
- Full check on 5cef374: oxfmt, lint, typecheck, build exit 0; bun test 2621/0 (57.3 s); test:browser 480 passed.
- Review: code-review round 1 (mixed-terra, 9/9 sources) found 3 major and 9 minor, all fixed; round 2 (final, 2/2) found nothing.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Engine tests now share one room rig, src/replica/room-rig.ts. It builds GM and player clients on the mock adapter, owns the default test timing and the AD-11 storage key format, and stops every engine, window and listener after each test. The 18 engine test files lost about 2700 lines of copied wiring and state only the timings and wait limits they change. No test was weakened: same 658 names and 662 assertions, same per-file timing and wait limits, and three engine mutations kill the same tests before and after. bun test takes 57-59 s as before. Follow-ups in deferred-work.md: no test covers the room-copy write guard during adoption, and four non-engine test files keep their own Timing literal.
<!-- SECTION:FINAL_SUMMARY:END -->
