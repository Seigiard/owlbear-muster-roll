---
id: TASK-64.8
title: Take dev-only preview code out of the shipped builder page
status: To Do
assignee: []
created_date: '2026-11-14T20:26:00Z'
updated_date: '2026-11-15T06:21:00Z'
labels:
  - architecture
  - builder
dependencies:
  - TASK-64.1
parent_task_id: TASK-64
type: task
ordinal: 84000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CLAUDE.md and the spine's file tree call `src/preview` dev-only, but `src/builder` (a production entry in `vite.config.ts`, AD-20) imports `@/preview/themes` in three files and `@/preview/stub-rolling` in `preview-pane.tsx`, and AD-20 itself lists `src/preview` among the builder's imports, so the spine contradicts its own tree. Either the two modules belong to the shared UI (`src/ui`), or preview is a shared module and the docs say so; AD-20 changes with the choice. The two modules are small (`themes.ts` 20 lines, `stub-rolling.ts` 12 lines). Validation on 2026-11-15 also found that `src/ui` is the one layer with no lint override: a probe file in `src/ui` importing `@/replica/engine` and `@/preview/themes` passed `bun run lint`, so the spine's UI edges hold by discipline only. This task adds that override, the way TASK-64.1 added the others. Small task; it sits after the lint rules so the choice can be locked by a rule.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No module under `src/builder` imports from `@/preview`, or CLAUDE.md and the spine declare `src/preview` a shared module and the lint override allows exactly that; AD-20 lists the builder imports as the code has them after this task
- [ ] #2 A lint override for `src/ui/**` forbids imports from `@/replica`, `@/builder` and `@/preview`, and a scratch file with each forbidden import makes `bun run lint` fail, recorded in the implementation notes
- [ ] #3 `bun run build` output for the builder page is unchanged in behavior: themes and stub rolling work in the builder preview
- [ ] #4 The full check passes
<!-- AC:END -->
