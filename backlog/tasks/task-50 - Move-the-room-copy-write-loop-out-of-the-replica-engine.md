---
id: TASK-50
title: Move the room copy write loop out of the replica engine
status: To Do
assignee: []
created_date: '2026-11-12T02:11:00Z'
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
- [ ] #1 A design pass decides whether a room copy module gets a smaller interface than the code it hides; if not, the task is archived with that reason
- [ ] #2 If it goes ahead: the write loop, owed and rerun state and the status live in one module over the metadata port, tested with a fake metadata port
- [ ] #3 Only the replica writes room metadata (AD-10); AD-8, AD-9 and AD-17 behavior is unchanged; the full check passes
<!-- AC:END -->
