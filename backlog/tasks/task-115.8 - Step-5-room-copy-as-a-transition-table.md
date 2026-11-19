---
id: TASK-115.8
title: 'Step 5: room-copy as a transition table'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-18T19:41:00Z'
updated_date: '2026-11-19T12:04:00Z'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/replica/room-copy-table.ts: a TransitionTable (src/replica/machine.ts) with phases idle, reading, writing, verifying, stopped and the events of the ticket, every cell a step or 'ignore'.
2. room-copy.ts becomes a shell that feeds events to the table and runs its effects, as catch-up.ts does after TASK-115.1.
3. machine-check with the invariant that write-metadata is emitted only into writing; docs/machines/room-copy.md generated.
4. tdd chain (run ~/.claude/artifacts/task-115-20261119/TASK-115.8); full check.
<!-- SECTION:PLAN:END -->
