---
id: TASK-115.1
title: 'Step 0: catch-up and liveness as transition tables with machine-check'
status: To Do
assignee: []
created_date: '2026-11-18T19:41:00Z'
labels:
  - architecture
  - replica
dependencies: []
documentation:
  - >-
    _bmad-output/planning-artifacts/architecture/effect-sync-core-2026-11-18/DESIGN.md
parent_task_id: TASK-115
ordinal: 144000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Nothing checks that every catch-up phase answers every event: eight pairs return a silent empty list (`catch-up.ts:285, 340, 489, 534, 554-562, 649-655, 738-740, 753`) and `knowledge` plus ten maps live in closure variables outside the phase. `catch-up` already returns decisions as data and has 48 module tests, so it is the pilot. `catch-up.ts` becomes a shell over a pure `catch-up-table.ts` and a `livenessTable` (unknown/online/offline) fed by the same shell, synchronously, catch-up first; the engine and `runCatchUp` do not change. `gmInRoom()` in the engine asks a different question (a GM in the party at all) and is renamed `gmInParty`; roll-flow behavior does not change. A conditional no-op inside a cell is covered by the table test, not by machine-check (owner decision Q5).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `src/replica/machine.ts` exports `Tagged`, `Step`, `Cell`, `TransitionTable` and `step`; a table missing one phase-event cell fails `bun run typecheck`
- [ ] #2 `tests/support/machine-check.ts` walks every cell with fast-check data, asserts the result phase kind is a row, each emitted effect kind is allowed for the result phase, every invariant holds, and fails when `docs/machines/<name>.md` differs from the rendered Mermaid
- [ ] #3 Each of the eight silent pairs is an explicit `ignore` cell or a transition; `docs/machines/catch-up.md` and `docs/machines/liveness.md` are generated and committed
- [ ] #4 `gmLink` is decided only by the liveness table; the engine predicate is named `gmInParty` and `GLOSSARY.md` defines both terms
- [ ] #5 `catch-up.test.ts` passes unchanged; the engine suite junit list equals the baseline; `engine.ts` does not change
<!-- AC:END -->
