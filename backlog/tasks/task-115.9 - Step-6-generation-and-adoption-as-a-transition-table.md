---
id: TASK-115.9
title: 'Step 6: generation and adoption as a transition table'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-18T19:41:00Z'
updated_date: '2026-11-19T13:21:00Z'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/replica/generation-table.ts: a TransitionTable over settled, importing, staged, saving and the ticket's events; per-phase rows with explicit ignore cells; persistence, ownGeneration, incoming and importing move into phase data.
2. generation-flow.ts becomes the shell that feeds events and runs effects; saveAdoption stays synchronous; the AD-9 orders (flush, save, replace, writeImport, reset; save, replace, roomCopy.replaced) become effect order in cells.
3. machine-check with the AD-9 order invariants; docs/machines/generation.md generated.
4. tdd chain (run ~/.claude/artifacts/task-115-20261119/TASK-115.9); full check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on task-115-9-generation-table (211c189). src/replica/generation-table.ts is a TransitionTable over settled, importing, staged, saving and the ticket's events, per-phase rows with explicit ignore cells; persistence, own generation, incoming and importing live in phase data. generation-flow.ts is the shell (~710 -> 374 lines) that runs effects in the order a cell emits them: local import flush, save, replace, write-import, reset; remote adoption save, replace, room-copy-replaced. saveAdoption stays synchronous; public API unchanged. machine-check: every cell present, no replace before save, saving left only by a store answer; docs/machines/generation.md generated. Checks: fmt, lint, typecheck, build; browser 587/587; bun: no baseline line lost, 13 new. Calibrated by mutation (reversed effects, store-failed and role-changed cells).
<!-- SECTION:NOTES:END -->
