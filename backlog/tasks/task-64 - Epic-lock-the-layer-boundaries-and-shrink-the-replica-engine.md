---
id: TASK-64
title: 'Epic: lock the layer boundaries and shrink the replica engine'
status: To Do
assignee: []
created_date: '2026-11-14T20:25:00Z'
labels:
  - epic
  - architecture
  - layer-boundaries
dependencies: []
type: enhancement
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An architecture review on 2026-11-14 found the layering of Muster Roll healthy in practice but held by discipline, not by tooling, and found one structural hot spot. Facts at review time: `src/core` imports only zod, nanoid and fflate; the only lint boundary is the Owlbear SDK import; `src/replica/background-main.ts` imports `@/ui/copy` and `src/replica/room-rig.ts` (626 lines of test rig in production source) imports `@/ui/projection-store` and `@/ui/replica-client`; the mock adapter is about 1750 lines against 316 in `src/platform/obr` with no port test shared by both adapters; `startReplicaEngine` in `src/replica/engine.ts` is one closure of about 2350 lines, 79 nested functions and 21 mutable `let` variables, tested only through full room simulation in 18 files of about 17000 lines; `src/builder` (a shipped page) imports `src/preview`, which CLAUDE.md calls dev-only. The owner chose the order: lint rules, then the rig move, then the adapter contract, then the engine and the smaller mismatches. The engine work follows the decision-as-data shape already used by `src/replica/catch-up.ts` and by ADR-0002 for the UI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every layer rule in the ARCHITECTURE-SPINE dependency diagram is enforced by lint, and `bun run lint` fails on a violation
- [ ] #2 No module under `src/replica` imports from `src/ui`, `src/builder` or `src/preview`, test rig included
- [ ] #3 One port contract test runs against both the mock and the OBR adapter for Storage, Broadcast and Metadata
- [ ] #4 The engine state machines for rolls, generation change and command routing are pure modules with their own unit tests, and `startReplicaEngine` only wires them to effects
- [ ] #5 The shipped builder page no longer depends on dev-only preview code, or the spine and CLAUDE.md declare preview a shared module
- [ ] #6 The ARCHITECTURE-SPINE layer table and diagram match the code at epic close
<!-- AC:END -->
