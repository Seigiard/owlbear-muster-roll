---
id: TASK-115.11
title: 'Step 8: align the spine and glossary with the accepted shape'
status: To Do
assignee: []
created_date: '2026-11-18T19:41:00Z'
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
