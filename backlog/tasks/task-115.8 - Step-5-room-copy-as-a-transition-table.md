---
id: TASK-115.8
title: 'Step 5: room-copy as a transition table'
status: To Do
assignee: []
created_date: '2026-11-18T19:41:00Z'
labels:
  - architecture
  - replica
dependencies:
  - TASK-115.6
documentation:
  - >-
    _bmad-output/planning-artifacts/architecture/effect-sync-core-2026-11-18/DESIGN.md
parent_task_id: TASK-115
ordinal: 151000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`room-copy.ts` already names its phases (`WritePhase`, `WriteLifecycle`) but decides them in code the completeness check cannot see. It becomes a table with phases idle, reading, writing, verifying, stopped over the events edited, caught-up, page-hidden, page-returned, fired(pause), read-done, write-done, verify-done, failed, checked by machine-check with the invariant that `write-metadata` is emitted only into `writing`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `room-copy-table.ts` is a `TransitionTable` checked by machine-check; `docs/machines/room-copy.md` is generated and committed
- [ ] #2 `room-copy.test.ts` and `engine-room-copy.test.ts` pass; engine suite junit list equals the baseline
<!-- AC:END -->
