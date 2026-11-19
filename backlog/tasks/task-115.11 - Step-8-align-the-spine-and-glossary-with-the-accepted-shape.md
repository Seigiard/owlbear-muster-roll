---
id: TASK-115.11
title: 'Step 8: align the spine and glossary with the accepted shape'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-18T19:41:00Z'
updated_date: '2026-11-19T13:32:00Z'
labels:
  - docs
dependencies:
  - TASK-115.7
  - TASK-115.8
  - TASK-115.9
  - TASK-115.10
  - TASK-115.5
documentation:
  - >-
    _bmad-output/planning-artifacts/architecture/effect-sync-core-2026-11-18/DESIGN.md
  - >-
    docs/adr/0004-replica-machines-are-complete-transition-tables-with-tagged-results.md
parent_task_id: TASK-115
ordinal: 154000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
At epic close the architecture spine must match the code: the Replica row and diagram name `machine.ts`, the table rule, the signal and the clock port; the AD-6 and AD-7 rules name the liveness and catch-up tables; `GLOSSARY.md` carries the two GM terms. DESIGN.md and ADR-0004 are checked against the code and any step that recorded a deviation is reconciled.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The spine Replica row, dependency diagram and AD-6/AD-7 rules name the table modules, `machine.ts`, the signal and the clock port
- [ ] #2 `GLOSSARY.md` defines Online GM (by messages) and GM in party (by the list) with avoid-lists
- [ ] #3 DESIGN.md migration table marks every step done with its PR
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Spine (architecture-owlbear-muster-roll-2026-11-10): Replica row, dependency diagram and AD-6/AD-7 rules name machine.ts, the catch-up, liveness, room-copy and generation tables, the AbortSignal, the clock port and the failure sink.
2. GLOSSARY.md: check Online GM and GM in party with avoid-lists.
3. DESIGN.md: migration table marks every step done with its PR; reconcile each deviation recorded in deferred-work.md under TASK-115.x and TASK-116 with DESIGN.md and ADR-0004.
4. Docs-only checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Aligned docs with the code (PR #75

1): ARCHITECTURE-SPINE Replica and Platform rows, dependency diagram, AD-6/AD-7 rules name catch-up-table (catchUpTable, livenessTable), room-copy-table, generation-table, machine.ts, the shared AbortSignal, the clock port and failures.ts. DESIGN.md migration table marks every step done with its PR, and the deviations from deferred-work (stop discards held commits, room-copy stopped phase, nonce check in catch-up, effects keyed by type, liveness starts offline) are written into DESIGN and ADR-0004. GLOSSARY.md already defined Online GM and GM in party with avoid-lists.
<!-- SECTION:NOTES:END -->
