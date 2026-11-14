---
id: TASK-61.10
title: >-
  Run the wipe confirmation through a pure reducer, as the probe for the
  settings flows
status: To Do
assignee: []
created_date: '2026-11-14T08:28:00Z'
labels:
  - architecture
  - ui-decoupling
dependencies:
  - TASK-61.7
references:
  - src/ui/settings/wipe-actions.tsx
  - src/ui/preset-actions.tsx
  - src/ui/settings/snapshot-actions.tsx
  - docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md
parent_task_id: TASK-61
type: task
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Settings hold three confirmation flows with the same phases, file or check, then confirm, then command, then refocus: preset upload (src/ui/preset-actions.tsx, 367 lines), snapshot import (src/ui/settings/snapshot-actions.tsx, 299) and wipe (src/ui/settings/wipe-actions.tsx, 204). doc-3 warns against turning them into one upload framework with flags. Wipe is the smallest and the only destructive one, with tests/wipe.e2e.ts and CAP-31/AD-9 as independent oracles, so the owner chose it on 2026-11-14 as the probe: if the reducer shape pays here, preset upload and snapshot import get their own tasks; if not, the owner records them as excluded. The shape is the one in ADR 0002 and the CLAUDE.md block: reducer module, useReducer in the component, command and refocus in the component.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 wipe-actions.tsx keeps its confirmation, sending and outcome state in a reducer module with unit tests for: confirm; cancel; a second press while sending does nothing; a refused or timed-out outcome returns to idle with the failure shown; a catch-up in progress blocks confirm
- [ ] #2 The component holds the reducer with useReducer and runs the wipe command and the refocus itself; no shared helper with the other settings flows
- [ ] #3 tests/wipe.e2e.ts passes unchanged
- [ ] #4 The task notes state in one paragraph whether the shape paid off (caller knowledge before and after) and name the decision for preset upload and snapshot import: tasks or owner exclusion
<!-- AC:END -->
