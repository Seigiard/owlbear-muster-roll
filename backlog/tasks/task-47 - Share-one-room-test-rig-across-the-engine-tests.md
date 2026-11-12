---
id: TASK-47
title: Share one room test rig across the engine tests
status: To Do
assignee: []
created_date: '2026-11-12T02:11:00Z'
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
- [ ] #1 One shared test module builds a room with GM and player clients on the mock adapter, and every engine test file uses it instead of its own wiring
- [ ] #2 Tests seed a room with records, not storage keys; the AD-11 key format appears in no test file outside the rig
- [ ] #3 Default timing lives in the rig; a test states only the timings it changes
- [ ] #4 Every test that passed before still passes with the same assertions; no test is skipped or weakened
<!-- AC:END -->
