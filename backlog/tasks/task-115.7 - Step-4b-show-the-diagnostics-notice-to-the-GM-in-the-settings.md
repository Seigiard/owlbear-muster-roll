---
id: TASK-115.7
title: 'Step 4b: show the diagnostics notice to the GM in the settings'
status: To Do
assignee: []
created_date: '2026-11-18T19:41:00Z'
labels:
  - ui
dependencies:
  - TASK-115.6
documentation:
  - >-
    _bmad-output/planning-artifacts/architecture/effect-sync-core-2026-11-18/DESIGN.md
parent_task_id: TASK-115
ordinal: 150000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Step 4 publishes recent replica failures as the `diagnostics` notice in the projection. Owner decision Q12: the window shows it to a GM only, as a collapsed block «Диагностика» in the settings; the banners players see do not change; the text lives in `src/copy.ts`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A GM window shows a collapsed «Диагностика» block in the settings listing the recent failures from the notice
- [ ] #2 A player window renders no new banner or block for `diagnostics`; the e2e suite for a player is unchanged
- [ ] #3 All interface text for the block is in `src/copy.ts`
<!-- AC:END -->
