---
id: TASK-64
title: 'Epic: lock the layer boundaries and shrink the replica engine'
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-14T20:25:00Z'
updated_date: '2026-11-15T16:29:00Z'
labels:
  - epic
  - architecture
  - layer-boundaries
dependencies: []
references:
  - TASK-63
type: enhancement
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An architecture review on 2026-11-14 found the layering of Muster Roll healthy in practice but held by discipline, not by tooling, and found one structural hot spot. Facts at review time: `src/core` imports only zod, nanoid and fflate; the only lint boundary is the Owlbear SDK import; `src/replica/background-main.ts` imports `@/ui/copy` and `src/replica/room-rig.ts` (626 lines of test rig in production source) imports `@/ui/projection-store` and `@/ui/replica-client`; the mock adapter is about 1750 lines against 316 in `src/platform/obr` with no port test shared by both adapters; `startReplicaEngine` in `src/replica/engine.ts` is one closure of about 2350 lines, 79 nested functions and 21 mutable `let` variables, tested only through full room simulation in 18 files of about 17000 lines; `src/builder` (a shipped page) imports `src/preview`, which CLAUDE.md calls dev-only. The owner chose the order: lint rules, then the rig move, then the adapter contract, then the engine and the smaller mismatches. The engine work follows the TASK-64.4 map after owner confirmation: each machine is independently unit-testable in its selected shape (catch-up-style decisions, ADR-0002 reducer, or injected ports/callbacks); `startReplicaEngine` wires ports and effects, extracted modules import no platform adapter, and no shared state-machine runtime is introduced.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every layer rule in the ARCHITECTURE-SPINE dependency diagram is enforced by lint, and `bun run lint` fails on a violation
- [x] #2 No module under `src/replica` imports from `src/ui`, `src/builder` or `src/preview`, test rig included
- [x] #3 One port contract test runs against both the mock and the OBR adapter for Storage, Broadcast and Metadata
- [x] #4 The engine state machines for rolls, generation change and command routing are independently unit-testable modules in the shapes selected by the owner-confirmed TASK-64.4 map; `startReplicaEngine` wires their ports and effects, extracted modules import no platform adapter, and no shared state-machine runtime is introduced
- [x] #5 The shipped builder page no longer depends on dev-only preview code, or the spine and CLAUDE.md declare preview a shared module
- [x] #6 The ARCHITECTURE-SPINE layer table and diagram match the code at epic close
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Complete TASK-64.5, 64.6, 64.7 and 64.9 in the owner-approved order through independent ticket TDD chains.
2. Merge each validated ticket branch into epic-64-5-6-7 with --no-ff; preserve all existing engine tests.
3. Reconcile the architecture spine and verify all epic acceptance criteria.
4. Run applicable full checks on the integrated tip and one closing code-review.
5. Open the PR to master, enable auto-merge as requested, and clean up ticket worktrees.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-14: reconciled with TASK-63 (explicit operation state in replica-client, RoomCopy and CatchUp). No overlap for TASK-64.1, 64.2, 64.3, 64.5, 64.8. TASK-64.4 (the engine map spike) and so TASK-64.6 and 64.7 wait for TASK-63.2 and TASK-63.3, because both reshape the state the generation machine reads. TASK-64.6 keeps the TASK-63 phase models and interfaces and reuses its adoption-race tests. TASK-64.2 should land before TASK-63.2/63.3 branch, so the rig path moves once.

2026-11-15: validated the epic against the code. Three tasks done (64.1, 64.2, 64.3). Found: `src/ui` has no lint override, so AC#1 is not met yet (added to TASK-64.8); AD-20 contradicts the spine tree on `src/preview` (TASK-64.8 fixes AD-20); TASK-64.7's 600-line target was not supported by the three planned machines (about 960 of about 2450 closure lines), so it became a qualitative criterion and TASK-64.4 may add extraction tasks; TASK-64.4 now weighs the injected-port module shape (`room-copy`, `pending-edits`) beside the two decision shapes.

2026-11-15, second validation after the TASK-64.4 map: the map is complete and the task order matches it. The owner reopened the generation shape and chose the injected-port module for TASK-64.6 (doc-4 revised, performCaughtUp to wiring). TASK-64.7 AC#1 allows an effectful batch loop instead of a mandatory stepwise reducer. TASK-64.9 carries the final spine check, since it is now the last engine task. Correction: the earlier note's 282-line dispatchRoomMessage was a miscount; it is 60 lines, the protocol machine about 270.

Closed after all nine subtasks completed. TASK-64.1/.8 retain their accepted negative lint-probe evidence; current lint passes and replica has no UI/builder/preview imports. TASK-64.2 retains the test rig outside production. AC3 uses the owner-approved documented paired OBR harness alternative from TASK-64.3: mock and Chromium evidence are automated; no live Owlbear host run is claimed. TASK-64.5/.6/.7/.9 now provide independently tested roll, generation, command and serialized room-protocol modules with unchanged preserved interfaces and no shared runtime. Architecture spine table and diagram name all four. Closing review completed 6/6 healthy sources, four minor findings fixed at 419b7086289e0ead79b32a08a5fa40c14ce2f40a; confirmation completed 2/2, no blocking findings or open questions. Fresh master PR #39 was merged cleanly at b52ecfb5d7f30fde485c87aa9eac76d35b84c094; reviewed extraction/engine bytes remain unchanged, and preserved engine tests match the fresh base. Integrated checks on that exact source: Bun 3164 pass/1 skip/0 fail, Chromium Node22 521 passed, 53/53 repository mutants killed, all 33 saved extraction regressions replayed assertion-red and restored clean; format/lint/types/build/backlog/whitespace pass. Automated proof excludes live Owlbear host behavior. PR #38 is the delivery; requested auto-merge follows final metadata publication.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The layer boundaries are enforced, the room rig is outside shipped code, and shared preview helpers no longer leak from dev-only code. Rolls, generation changes, command routing and room traffic now have independently tested modules; the engine retains their wiring and the existing CatchUp interpreter. All subtasks, integrated checks and closing review are complete. The OBR contract remains an owner-run documented harness, not a claimed live-host test.
<!-- SECTION:FINAL_SUMMARY:END -->
