---
id: TASK-115.10
title: 'Step 7: judge pending-edits and room-protocol for tables'
status: To Do
assignee: []
created_date: '2026-11-18T19:41:00Z'
labels:
  - architecture
  - replica
dependencies:
  - TASK-115.6
  - TASK-114.2
documentation:
  - >-
    _bmad-output/planning-artifacts/architecture/effect-sync-core-2026-11-18/DESIGN.md
parent_task_id: TASK-115
ordinal: 153000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
DESIGN.md leaves `pending-edits` (per-entry waiting, sent, denied-quiet) and `room-protocol` (idle, assembling) to be judged one by one: a machine with two phases may stay a linear function. This task reads both after TASK-114.2, which forbids merging `proposal-queue` into `pending-edits` and reshapes their helpers, and either converts each to a table checked by machine-check or records in DESIGN.md why it stays a function. The `roomMessages` promise chain stays until the Effect revisit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For each of the two modules, either a `TransitionTable` with its generated diagram exists, or DESIGN.md records the reason it stays a linear function
- [ ] #2 `engine-propose`, `engine-client` and `engine-no-gm` pass; engine suite junit list equals the baseline
<!-- AC:END -->
