---
id: TASK-61.7
title: Turn the remaining UI ownership map into bounded migration tasks
status: Done
assignee:
  - '@claude'
created_date: '2026-11-13T09:45:00Z'
updated_date: '2026-11-14T08:29:00Z'
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
- [x] #1 Each ownership-map row has a disposition: already meets the approved goal with evidence, requires a linked bounded migration task, or has an explicit owner-approved exclusion.
- [x] #2 Remaining migrations are child tasks of TASK-61 with their own observable acceptance criteria, dependencies and required specs; the current document is not their implementation plan.
- [x] #3 Shared mechanisms follow validated repeated needs; rejected or unproven hypotheses are not smuggled into later tasks as requirements.
- [x] #4 The epic closeout checklist points to evidence for each flow and remains incomplete while required migration tasks are open.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Dispose every doc-1 coverage row from doc-3's ownership matrix and the TASK-61.5/61.6 outcomes: meets goal, bounded migration, or owner exclusion. 2. Owner decision (2026-11-14): migrations for the link picker, a wipe-confirmation probe for the settings flows, and the builder preview shown-tab rule; field editing, repeat blocks and the small cleanups are excluded. 3. Create the three tasks under TASK-61 with observable criteria and dependencies. 4. Record dispositions and a closeout checklist in doc-1 through the CLI; close this task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dispositions (2026-11-14, owner decision in session): meets goal for navigation, frame/sidebar, dice, map selection, builder document, shared renderer; requires migration for the link picker (TASK-61.8), the builder preview shown tab (TASK-61.9) and the wipe confirmation as the probe for the settings flows (TASK-61.10); owner exclusion for field editing and repeat blocks, builder tree collapse and rename consequences, and the small integration cleanups. No shared mechanism was carried into the tasks: each names the ADR 0002 shape and keeps its effects in its component. doc-1 holds the dispositions, the work graph and the closeout checklist.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every row of the UI coverage map has a final disposition in doc-1. Three bounded migration tasks exist under TASK-61 with observable criteria and dependencies: TASK-61.8 (link picker reducer), TASK-61.9 (builder preview shown tab), TASK-61.10 (wipe confirmation reducer as the probe for the settings flows). The owner excluded field editing, repeat blocks, builder tree collapse, rename consequences and the small cleanups on 2026-11-14. doc-1 carries an epic closeout checklist that stays open while the three tasks are open.
<!-- SECTION:FINAL_SUMMARY:END -->
