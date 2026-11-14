---
id: TASK-63
title: 'Epic: make projection, room-copy and catch-up operation state explicit'
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-14T14:09:00Z'
updated_date: '2026-11-14T22:14:00Z'
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
- [x] #1 CAP-1 through CAP-3 have completed bounded tasks, with production state owning phase-specific data and no duplicate writable phase flags.
- [x] #2 Each slice records phase invariants and before/after caller knowledge; preserved room behavior is supported by the existing suites and project full check.
- [x] #3 Picker remains owned by TASK-61.8; settings decisions remain owned by TASK-61.10; accepted dice and excluded UI dispositions remain intact.
- [x] #4 The work preserves module interfaces, room protocol, storage formats and existing async guarantees without adding a shared state-machine runtime.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the completed TASK-63.1 projection delivery work.
2. Complete TASK-63.2 room-copy phase ownership, then TASK-63.3 catch-up/adoption phase ownership in dependency order.
3. Validate both slices, run the closing combined review, close all TASK-63 criteria, and publish one PR with auto-merge as requested.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed CAP-1 through CAP-3 in TASK-63.1, TASK-63.2 and TASK-63.3. Projection delivery, room-copy writes and catch-up/adoption now own their valid phase data inside the existing modules. Each task records invariants and before/after caller knowledge. Public interfaces, room protocol, storage formats, async guarantees and existing picker/settings/dice ownership stay unchanged; no shared runtime was added. Final combined source passed 3009 unit tests with one environment-only DOM skip, 520 browser tests, format, lint, typecheck and build. TASK-50 R1-R16 and TASK-48 M1-M12 controls all killed. Closing review fixed the R13 control and confirmed no blocking findings with 2/2 final sources. Deferred constructions/polish are recorded, not claimed as production defects. PR: https://github.com/Seigiard/owlbear-muster-roll/pull/26.
<!-- SECTION:FINAL_SUMMARY:END -->
