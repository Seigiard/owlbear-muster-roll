---
id: TASK-63.2
title: Make room-copy write phases and deferred work explicit
status: To Do
assignee: []
created_date: '2026-11-14T14:10:00Z'
labels:
  - architecture
  - state-model
dependencies:
  - TASK-63.1
references:
  - src/replica/room-copy.ts
  - src/replica/room-copy.test.ts
  - src/replica/engine-room-copy.test.ts
  - _bmad-output/implementation-artifacts/spec-task-50-room-copy-module.md
documentation:
  - _bmad-output/specs/spec-explicit-operation-state/SPEC.md
parent_task_id: TASK-63
type: task
ordinal: 74000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CAP-2. TASK-50 already placed room-copy policy behind RoomCopy. Inside that module, writing, rerun, owed, scheduled cancellation and writeRun jointly encode the operation lifecycle. An ordinary write and an import must serialize while saved-copy status remains independent. This slice makes those relationships explicit without moving ownership or broadening the interface. It follows projection delivery because it adds asynchronous port completion, read-back verification and generation replacement.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One production state owns the active write phase and ordinary/import mode; deferred work and rerun requests have an explicit owner; saved-copy status remains independent of an in-flight operation.
- [ ] #2 At most one ordinary/import metadata write lifecycle owns the write slot; an import waits for the preceding ordinary write, and triggers during a write produce the existing follow-up write rather than being lost.
- [ ] #3 A write reports saved only after read-back verification; read, encoding, capacity, write and verification failures preserve the previous copy and required notices according to AD-8/AD-9.
- [ ] #4 Visibility/resume changes, catch-up gating, higher generations, unreadable/older/newer copies and replacement preserve current behavior; stop and demotion retain their current guarantees without pretending to cancel a port call already started.
- [ ] #5 Room-copy and import/wipe integration checks plus the project full check pass; task evidence records phase invariants and caller knowledge, and reuses TASK-50 behavioral/mutation oracles where applicable.
<!-- AC:END -->
