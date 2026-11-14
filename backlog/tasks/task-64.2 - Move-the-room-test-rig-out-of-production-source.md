---
id: TASK-64.2
title: Move the room test rig out of production source
status: To Do
assignee: []
created_date: '2026-11-14T20:25:00Z'
labels:
  - architecture
  - tests
dependencies:
  - TASK-64.1
parent_task_id: TASK-64
type: task
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog TASK-47 made `src/replica/room-rig.ts` the one rig for the 18 engine test files. It is 626 lines of test infrastructure that sits beside shipped code and imports `@/ui/projection-store` and `@/ui/replica-client`, which is the only reason the replica layer still reaches into ui. Vite does not bundle it, so this is a boundary and readability problem, not a size problem. The lint task before this one leaves a single exemption for this file.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The rig lives under a test-only path (`tests/support/` or `src/replica/testing/`), and no file under `src/replica` outside that path imports from `@/ui`
- [ ] #2 The lint exemption for `room-rig.ts` is gone and `bun run lint` passes without it
- [ ] #3 Every engine test imports the rig from its new path; the engine test count is unchanged
- [ ] #4 CLAUDE.md names the new rig path in the tests block
- [ ] #5 The full check passes
<!-- AC:END -->
