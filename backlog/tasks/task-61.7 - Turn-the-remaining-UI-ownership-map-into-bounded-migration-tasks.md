---
id: TASK-61.7
title: Turn the remaining UI ownership map into bounded migration tasks
status: To Do
assignee: []
created_date: '2026-11-13T09:45:00Z'
labels:
  - architecture
  - ui-decoupling
dependencies:
  - TASK-61.6
documentation:
  - >-
    backlog/docs/doc-1 -
    Epic-framework-independent-UI-behavior-and-simple-rendering.md
parent_task_id: TASK-61
type: docs
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner explicitly warned that finishing the first scenario can erase the wider goal. After two flows provide evidence, reconcile every UI flow against the epic instead of declaring the architecture work complete. This task decomposes remaining work; it is not permission for an all-at-once rewrite.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each ownership-map row has a disposition: already meets the approved goal with evidence, requires a linked bounded migration task, or has an explicit owner-approved exclusion.
- [ ] #2 Remaining migrations are child tasks of TASK-61 with their own observable acceptance criteria, dependencies and required specs; the current document is not their implementation plan.
- [ ] #3 Shared mechanisms follow validated repeated needs; rejected or unproven hypotheses are not smuggled into later tasks as requirements.
- [ ] #4 The epic closeout checklist points to evidence for each flow and remains incomplete while required migration tasks are open.
<!-- AC:END -->
