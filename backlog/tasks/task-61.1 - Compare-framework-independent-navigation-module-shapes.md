---
id: TASK-61.1
title: Compare framework-independent navigation module shapes
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-13T09:44:00Z'
updated_date: '2026-11-14T06:23:00Z'
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
- [x] #1 The epic compares at least three materially different module shapes by interface knowledge, depth, locality, leverage and lifecycle cost.
- [x] #2 Each option accounts for projection/outcome order, stale async completions, repeated open requests, demotion, disposal and render replay.
- [x] #3 State and effects are separated without moving DOM, React or replica ownership into the navigation core.
- [x] #4 H1/H2/H3 verdicts distinguish source-grounded feasibility from behavior not yet demonstrated by a pilot; generic event delivery is justified or explicitly unnecessary.
- [x] #5 The recommendation states what transfers to the remaining UI and what the pilot cannot prove; owner approval remains a separate gate.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect current navigation rules, callers, outcomes and architecture constraints. 2. Compare fresh-context pure-transition, active-event and current-caller designs. 3. Reconcile their ownership, effect delivery, lifecycle, stale outcomes and test surfaces. 4. Record trade-offs and unresolved owner decisions in the epic without implementing a design.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-13: three fresh-context, read-only explorations compared pure transitions with an external runner, an active event-driven module, and an existing-store-centered presenter. Preliminary differences and unresolved choices are recorded in doc-1. No tests or pilot ran; H1-H6 remain untested. Detailed recommendation and owner approval are still pending; no task acceptance criteria are marked complete.

2026-11-13: doc-2 now preserves the detailed source-grounded comparison and recommendation: pure rules inside a flow-specific headless module, reusing current host infrastructure where useful. An executed observation on the real ProjectionStore shows raw atom listeners receiving intermediate combinations of records, sync role and loaded; this constrains input publication but is not evidence of a broken React window. Lifecycle/effect reconciliation and owner review remain open. Storybook, registry and full UI audit have not been tested.

2026-11-14: closed against the evidence that exists. #1 and #5: doc-2 compares pure transitions, an active module and a store-centered presenter by depth, locality, leverage, cost and constraints, names what transfers and what a pilot cannot prove, and left approval to the owner (ADR 0002). #2: doc-2 covers projection/outcome order (AD-10, the raw-atom observation) and stale identity; the TASK-61.5 reducer tests cover stale outcomes, repeated open requests and demotion; disposal and render replay do not arise in the reducer shape, where a React effect feeds facts after a committed render. #3: the reducer in src/ui/navigation.ts imports only types; DOM, React and replica ownership stayed in the window, core and replica. #4: doc-1 records H1/H2 as supported for navigation and H3 as needing no general bus, with the pilot's bounds.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Compared three module shapes for window navigation in doc-2 (pure transitions, active event-driven module, store-centered presenter). The owner chose pure transitions with React rendering (ADR 0002); the TASK-61.5 pilot implemented it as one reducer and showed H1/H2 supported for navigation and no need for a general event bus (H3). What transfers to other flows and what the pilot cannot prove are recorded in doc-1; H6 stays for TASK-61.6.
<!-- SECTION:FINAL_SUMMARY:END -->
