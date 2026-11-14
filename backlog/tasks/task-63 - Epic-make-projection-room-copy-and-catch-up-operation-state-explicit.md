---
id: TASK-63
title: 'Epic: make projection, room-copy and catch-up operation state explicit'
status: To Do
assignee: []
created_date: '2026-11-14T14:09:00Z'
labels:
  - architecture
  - state-model
dependencies: []
references:
  - TASK-61.7
  - TASK-61.8
  - TASK-61.10
  - TASK-48
  - TASK-50
documentation:
  - _bmad-output/specs/spec-explicit-operation-state/SPEC.md
type: enhancement
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Maintainers currently reconstruct valid operation phases from separate flags and nullable data inside three existing modules. The goal is to make phase invariants local while preserving room behavior and existing interfaces. TASK-61.8 already owns the picker pilot; TASK-61.10 owns settings decisions. TASK-48 and TASK-50 already extracted catch-up and room copy, so this epic strengthens their internal state rather than repeating extraction. Delivery order: existing TASK-61.8, then projection delivery, then room-copy writes, then catch-up/adoption. This order limits concurrent changes and increases protocol complexity gradually.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CAP-1 through CAP-3 have completed bounded tasks, with production state owning phase-specific data and no duplicate writable phase flags.
- [ ] #2 Each slice records phase invariants and before/after caller knowledge; preserved room behavior is supported by the existing suites and project full check.
- [ ] #3 Picker remains owned by TASK-61.8; settings decisions remain owned by TASK-61.10; accepted dice and excluded UI dispositions remain intact.
- [ ] #4 The work preserves module interfaces, room protocol, storage formats and existing async guarantees without adding a shared state-machine runtime.
<!-- AC:END -->
