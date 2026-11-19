---
id: TASK-115.8
title: 'Step 5: room-copy as a transition table'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-18T19:41:00Z'
updated_date: '2026-11-19T15:33:00Z'
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
- [x] #1 `room-copy-table.ts` is a `TransitionTable` checked by machine-check; `docs/machines/room-copy.md` is generated and committed
- [x] #2 `room-copy.test.ts` and `engine-room-copy.test.ts` pass; engine suite junit list equals the baseline
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/replica/room-copy-table.ts: a TransitionTable (src/replica/machine.ts) with phases idle, reading, writing, verifying, stopped and the events of the ticket, every cell a step or 'ignore'.
2. room-copy.ts becomes a shell that feeds events to the table and runs its effects, as catch-up.ts does after TASK-115.1.
3. machine-check with the invariant that write-metadata is emitted only into writing; docs/machines/room-copy.md generated.
4. tdd chain (run ~/.claude/artifacts/task-115-20261119/TASK-115.8); full check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on task-115-8-room-copy-table (f1ec978, merged with epic as aded708). src/replica/room-copy-table.ts is a TransitionTable over idle, reading, writing, verifying, stopped and the ticket's events, per-phase rows with explicit ignore cells; ordinary and import writes share the phase as their mutex. room-copy.ts is a shell (684 -> 423 lines) that feeds events and runs effects; public API unchanged. machine-check: every cell present, write-metadata only into writing, stopped finishes the write in flight and never writes again; docs/machines/room-copy.md generated. Checks: fmt, lint, typecheck, build; browser 587/587; bun: no baseline line lost, 36 new. Calibrated.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Room copy is a transition table (PR #71): room-copy-table.ts with idle, reading, writing, verifying, stopped (stopped finishes a write in flight), 11 ignore cells, generated docs/machines/room-copy.md; room-copy.ts is its shell. Room-copy and engine tests pass; junit baseline held.
<!-- SECTION:FINAL_SUMMARY:END -->
