---
id: TASK-61.11
title: Extract preset-upload confirmation transitions into a pure reducer
status: To Do
assignee: []
created_date: '2026-11-14T14:37:00Z'
labels:
  - architecture
  - ui-decoupling
dependencies: []
references:
  - TASK-61.10
  - src/ui/preset-actions.tsx
  - docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md
parent_task_id: TASK-61
type: task
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-61.10. The wipe probe showed that a flow-specific pure reducer creates direct transition seams without moving command or browser effects out of the component. Apply that validated local boundary to the preset-upload confirmation flow in src/ui/preset-actions.tsx. The evidence is the locked reducer test src/ui/settings/wipe-actions-reducer.test.ts, its focused command, and calibration-2 regression results; use it as a boundary decision, not as a reason to build shared machinery. This task is intentionally unimplemented and must remain To Do until started.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The preset-upload confirmation flow has a flow-specific pure reducer with direct transition coverage, while src/ui/preset-actions.tsx owns useReducer.
- [ ] #2 The component keeps preset-upload command dispatch and browser effects, including refocus; the reducer has no React or DOM dependency.
- [ ] #3 No generic or shared settings-flow or upload framework or helper is introduced.
- [ ] #4 Existing preset-upload browser behavior remains covered by its applicable unchanged browser tests.
<!-- AC:END -->
