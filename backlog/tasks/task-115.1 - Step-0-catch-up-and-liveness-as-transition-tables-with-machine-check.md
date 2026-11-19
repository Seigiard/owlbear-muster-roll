---
id: TASK-115.1
title: 'Step 0: catch-up and liveness as transition tables with machine-check'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-18T19:41:00Z'
updated_date: '2026-11-19T15:33:00Z'
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
- [x] #1 `src/replica/machine.ts` exports `Tagged`, `Step`, `Cell`, `TransitionTable` and `step`; a table missing one phase-event cell fails `bun run typecheck`
- [x] #2 `tests/support/machine-check.ts` walks every cell with fast-check data, asserts the result phase kind is a row, each emitted effect kind is allowed for the result phase, every invariant holds, and fails when `docs/machines/<name>.md` differs from the rendered Mermaid
- [x] #3 Each of the eight silent pairs is an explicit `ignore` cell or a transition; `docs/machines/catch-up.md` and `docs/machines/liveness.md` are generated and committed
- [x] #4 `gmLink` is decided only by the liveness table; the engine predicate is named `gmInParty` and `GLOSSARY.md` defines both terms
- [x] #5 `catch-up.test.ts` passes unchanged; the engine suite junit list equals the baseline; `engine.ts` does not change
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add src/replica/machine.ts (Tagged, Step, Cell, TransitionTable, step) with a type fixture proving a missing cell fails typecheck.
2. Add tests/support/machine-check.ts: fast-check walk of every non-ignore cell, row/effect/invariant assertions, Mermaid stateDiagram-v2 rendering compared with docs/machines/<name>.md.
3. Split catch-up.ts into a pure catch-up-table.ts (catchUpTable) plus livenessTable; closure state moves into the phase record; the shell feeds catch-up first, then liveness, and keeps today's decision order and the synchronous saveAdoption contract.
4. Turn the eight silent pairs and the fired fallthrough into explicit 'ignore' cells or transitions; table tests in catch-up-table.test.ts cover conditional no-ops; machine-check files generate docs/machines/catch-up.md and liveness.md.
5. Rename engine gmInRoom to gmInParty (RollFlowPorts key and stubs) and define Online GM and GM in party in GLOSSARY.md in the same commit.
6. Run via the tdd chain (implement-spec run ~/.claude/artifacts/task-115-20261119/TASK-115.1); check catch-up.test.ts unchanged and the junit lists against _bmad-output/implementation-artifacts/task-115-baseline; full check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on task-115-1-catch-up-tables: src/replica/machine.ts (TransitionTable, step), tests/support/machine-check.ts (fast-check walk, row/effect/invariant checks, deterministic Mermaid compared with docs/machines/<name>.md, UPDATE_MACHINES=1 rewrites), src/replica/catch-up-table.ts (four per-phase rows, 22 explicit 'ignore' cells, liveness table offline/online), catch-up.ts a 253-line shell feeding catch-up then liveness with saveAdoption as a synchronous adoption-saved follow-up. gmInRoom renamed gmInParty; GLOSSARY.md gains GM in party. Tests: 21 new (machine, machine-check, catch-up-table, catch-up-machine, liveness-machine); catch-up.test.ts and engine-*.test.ts unchanged. Checks on dac5154: oxfmt, lint, typecheck, bun test (0 baseline lines missing), browser 583/583, build. Calibrated: invariant and stale-diagram rows. Deviations from DESIGN.md recorded in deferred-work.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Catch-up and liveness are transition tables (PR #62): src/replica/machine.ts (TransitionTable, step), catchUpTable and livenessTable in catch-up-table.ts, the eight silent pairs as explicit cells, tests/support/machine-check.ts, generated docs/machines/catch-up.md and liveness.md; gmInParty named and both GM terms in GLOSSARY.md. Verified by the locked table tests, catch-up.test.ts unchanged, and the junit baseline. Follow-up: the closing review found that answersOwn no longer counts the new 'adopting' phase (TASK-129).
<!-- SECTION:FINAL_SUMMARY:END -->
