---
id: TASK-64.1
title: Enforce the layer dependency rules with lint overrides
status: To Do
assignee: []
created_date: '2026-11-14T20:25:00Z'
updated_date: '2026-11-14T20:26:00Z'
labels:
  - architecture
  - layer-boundaries
dependencies: []
parent_task_id: TASK-64
type: task
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The ARCHITECTURE-SPINE diagram says core depends on nothing, replica and ui depend on core and ports, platform depends on core, and builder depends on core and the sheet components of ui. Only the Owlbear SDK import is enforced today (`.oxlintrc.json`, `no-restricted-imports`). Two leaks already exist: `src/replica/background-main.ts` imports `@/ui/copy`, and `src/replica/room-rig.ts` imports two ui modules. The copy module is interface text used by both the window and the background page, so its home under `src/ui` contradicts the layer; it moves out as part of this task. The rig move is TASK-64.2, next in order; this task gives `room-rig.ts` one explicit file-level exemption that TASK-64.2 removes. Oxlint supports per-path `overrides` with their own `no-restricted-imports` patterns.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Lint fails when a module under `src/core` imports from `@/platform`, `@/replica`, `@/ui`, `@/builder`, `@/preview`, `react` or `react-dom`
- [ ] #2 Lint fails when a module under `src/replica` imports from `@/ui`, `@/builder` or `@/preview`; `src/replica/room-rig.ts` carries the only exemption, with a comment naming the task that removes it
- [ ] #3 Lint fails when a module under `src/platform` imports from `@/replica`, `@/ui`, `@/builder` or `@/preview`
- [ ] #4 Lint fails when a module under `src/builder` imports from `@/replica` or `@/platform`
- [ ] #5 Interface text lives outside `src/ui` and every former importer of `@/ui/copy` compiles; CLAUDE.md names the new path
- [ ] #6 Each rule has a negative check: a scratch file with a forbidden import makes `bun run lint` fail, recorded in the implementation notes
- [ ] #7 The full check passes: format, lint, typecheck, `bun test`, `bun run test:browser`, build
<!-- AC:END -->
