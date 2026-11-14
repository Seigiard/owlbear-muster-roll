---
id: TASK-64.8
title: Take dev-only preview code out of the shipped builder page
status: To Do
assignee: []
created_date: '2026-11-14T20:26:00Z'
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
CLAUDE.md and the spine call `src/preview` dev-only, but `src/builder` (a production entry in `vite.config.ts`, AD-20) imports `@/preview/themes` in three files and `@/preview/stub-rolling` in `preview-pane.tsx`. Either the two modules belong to the shared UI (`src/ui`), or preview is a shared module and the docs say so. Small task; it sits after the lint rules so the choice can be locked by a rule.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No module under `src/builder` imports from `@/preview`, or CLAUDE.md and the spine declare `src/preview` a shared module and the lint override allows exactly that
- [ ] #2 `bun run build` output for the builder page is unchanged in behavior: themes and stub rolling work in the builder preview
- [ ] #3 The full check passes
<!-- AC:END -->
