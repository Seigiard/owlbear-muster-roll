---
id: TASK-61.6
title: Validate UI separation on a second flow before sharing mechanisms
status: To Do
assignee: []
created_date: '2026-11-13T09:45:00Z'
labels:
  - architecture
  - ui-decoupling
dependencies:
  - TASK-61.5
documentation:
  - >-
    backlog/docs/doc-1 -
    Epic-framework-independent-UI-behavior-and-simple-rendering.md
parent_task_id: TASK-61
type: spike
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A navigation-only design can accidentally become a framework for one caller. Use the ownership map and pilot findings to choose a materially different second flow, such as a settings confirmation flow or builder selection. The choice is intentionally deferred until evidence exists; builder document and undo already have useful separation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A second flow is selected from the epic map with a reason tied to a different interaction or effect pattern, not convenience alone.
- [ ] #2 The experiment demonstrates which parts of the approved separation transfer unchanged and which stay flow-specific.
- [ ] #3 A shared state-machine helper, emitter or registry is added to the proposal only when two real uses justify its seam; otherwise rejection is recorded.
- [ ] #4 Behavior has independent observable oracles, and the experiment distinguishes executable evidence from a design sketch.
- [ ] #5 H6 and the epic end-state map are updated; any approved production migration becomes a bounded follow-up task rather than silently expanding this spike.
<!-- AC:END -->
