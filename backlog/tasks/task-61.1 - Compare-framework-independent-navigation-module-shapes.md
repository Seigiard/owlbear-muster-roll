---
id: TASK-61.1
title: Compare framework-independent navigation module shapes
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-11-13T09:44:00Z'
updated_date: '2026-11-13T09:57:00Z'
labels:
  - architecture
  - ui-decoupling
dependencies: []
references:
  - src/ui/main.tsx
  - >-
    https://reports.1218217.xyz/reports/owlbear-muster-roll/20261113T095653Z-ee83c4f3/index.html
documentation:
  - >-
    backlog/docs/doc-1 -
    Epic-framework-independent-UI-behavior-and-simple-rendering.md
  - >-
    backlog/docs/doc-2 -
    Research-framework-independent-navigation-and-visual-isolation.md
parent_task_id: TASK-61
type: spike
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner selected framework-independent behavior with React retained for rendering, and navigation as the first validation slice. Pure transitions, an active event-driven module, and an existing-store-centered presenter have different costs for ordering command outcomes, projection updates and DOM effects. Compare them before treating a state machine library or event emitter as necessary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The epic compares at least three materially different module shapes by interface knowledge, depth, locality, leverage and lifecycle cost.
- [ ] #2 Each option accounts for projection/outcome order, stale async completions, repeated open requests, demotion, disposal and render replay.
- [ ] #3 State and effects are separated without moving DOM, React or replica ownership into the navigation core.
- [ ] #4 H1/H2/H3 verdicts distinguish source-grounded feasibility from behavior not yet demonstrated by a pilot; generic event delivery is justified or explicitly unnecessary.
- [ ] #5 The recommendation states what transfers to the remaining UI and what the pilot cannot prove; owner approval remains a separate gate.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect current navigation rules, callers, outcomes and architecture constraints. 2. Compare fresh-context pure-transition, active-event and current-caller designs. 3. Reconcile their ownership, effect delivery, lifecycle, stale outcomes and test surfaces. 4. Record trade-offs and unresolved owner decisions in the epic without implementing a design.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-13: three fresh-context, read-only explorations compared pure transitions with an external runner, an active event-driven module, and an existing-store-centered presenter. Preliminary differences and unresolved choices are recorded in doc-1. No tests or pilot ran; H1-H6 remain untested. Detailed recommendation and owner approval are still pending; no task acceptance criteria are marked complete.

2026-11-13: doc-2 now preserves the detailed source-grounded comparison and recommendation: pure rules inside a flow-specific headless module, reusing current host infrastructure where useful. An executed observation on the real ProjectionStore shows raw atom listeners receiving intermediate combinations of records, sync role and loaded; this constrains input publication but is not evidence of a broken React window. Lifecycle/effect reconciliation and owner review remain open. Storybook, registry and full UI audit have not been tested.
<!-- SECTION:NOTES:END -->
