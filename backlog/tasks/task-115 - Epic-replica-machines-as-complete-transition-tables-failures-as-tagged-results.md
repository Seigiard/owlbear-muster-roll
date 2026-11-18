---
id: TASK-115
title: >-
  Epic: replica machines as complete transition tables, failures as tagged
  results
status: To Do
assignee: []
created_date: '2026-11-18T19:41:00Z'
labels:
  - epic
  - architecture
  - replica
dependencies: []
references:
  - TASK-64
  - TASK-114
documentation:
  - >-
    _bmad-output/planning-artifacts/architecture/effect-sync-core-2026-11-18/DESIGN.md
  - >-
    docs/adr/0004-replica-machines-are-complete-transition-tables-with-tagged-results.md
type: enhancement
ordinal: 143000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR-0004 (accepted 2026-11-18) answers the owner request for a simpler sync core, typed errors and automatically checked state-machine completeness. Today `src/replica` holds its machines in four shapes, eight phase-event pairs in `catch-up` answer with a silent empty list, 86 `console.error` calls in seven patterns are the only failure channel, and stopping is a `stopped` flag in six modules. The decision has four parts in order: every machine a `TransitionTable` whose type requires one cell per phase-event pair plus a shared `machine-check`; one `AbortSignal` and one clock port in plain TypeScript; `better-result` in place of `core/result.ts` with policy in the module and one delivery sink; Effect deferred behind measurable conditions. Each subtask is one step of the migration table in DESIGN.md and ships with the full check and a `bun test` junit list equal to the baseline. Order set by the owner: steps 0, 0b, 2, 3 run in parallel with TASK-114; step 1 lands after TASK-114.3; steps 4, 4b, 7 after TASK-114.2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every subtask is Done and the engine suite junit list equals the baseline at the epic tip
- [ ] #2 ADR-0004 and DESIGN.md match the code at epic close; the spine Replica row names `machine.ts`, the table rule, the signal and the clock port
- [ ] #3 `GLOSSARY.md` carries Online GM (by messages) and GM in party (by the list)
<!-- AC:END -->
