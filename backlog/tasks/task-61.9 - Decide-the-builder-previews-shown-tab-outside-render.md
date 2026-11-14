---
id: TASK-61.9
title: Decide the builder preview's shown tab outside render
status: To Do
assignee: []
created_date: '2026-11-14T08:28:00Z'
labels:
  - architecture
  - ui-decoupling
dependencies:
  - TASK-61.7
references:
  - src/builder/preview-pane.tsx
  - docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md
parent_task_id: TASK-61
type: task
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/builder/preview-pane.tsx:76-91 applies the AD-23 rule (the preview shows the tab that holds the selected item, else keeps its tab) by updating local state during render, the pattern window navigation had before TASK-61.5. The builder is a GM-side dev tool, so players gain nothing; the gain is one shape across flows and a rule a unit test can drive. The owner chose this as a small bounded task on 2026-11-14. Keep it small: a derived value where the rule allows it, a reducer only if state must survive across selections.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The shown-tab rule is a pure function or reducer in its own module with unit tests for: the selected item is on the shown tab (stays); on another tab (switches); in no tab (keeps the shown tab); no template tabs
- [ ] #2 preview-pane.tsx no longer calls a state setter during render
- [ ] #3 Builder browser tests pass unchanged
<!-- AC:END -->
