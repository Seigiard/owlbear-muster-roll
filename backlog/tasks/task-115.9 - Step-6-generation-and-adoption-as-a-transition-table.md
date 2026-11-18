---
id: TASK-115.9
title: 'Step 6: generation and adoption as a transition table'
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
ordinal: 152000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`generation-flow.ts` holds `persistence`, `ownGeneration`, `incoming` and `importing` as separate variables and two linear effect sequences; preset change and adoption share one flow cut across two modules. It becomes a table with phases settled, importing, staged, saving over the events import, wipe, check-snapshot, adopt-from-copy, see-generation, stage, clear-staged, save-adoption, store-written, store-failed, role-changed. The synchronous `saveAdoption` contract with catch-up does not change, and the AD-9 save-then-replace order is the risk the adoption tests guard.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `generation-table.ts` is a `TransitionTable` checked by machine-check; `docs/machines/generation.md` is generated and committed
- [ ] #2 Local import keeps the order flush, save, replace, writeImport, reset; remote adoption keeps save, replace, `roomCopy.replaced`; `saveAdoption` stays synchronous
- [ ] #3 `generation-flow.test.ts`, `engine-import`, `engine-preset` and `engine-catch-up` pass; engine suite junit list equals the baseline
<!-- AC:END -->
