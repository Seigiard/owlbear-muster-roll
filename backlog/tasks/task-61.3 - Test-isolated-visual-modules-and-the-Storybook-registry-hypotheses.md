---
id: TASK-61.3
title: Test isolated visual modules and the Storybook registry hypotheses
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-11-13T09:44:00Z'
updated_date: '2026-11-13T10:42:00Z'
labels:
  - architecture
  - ui-decoupling
dependencies: []
references:
  - src/ui/shell/window-frame.tsx
  - docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md
  - >-
    https://reports.1218217.xyz/reports/owlbear-muster-roll/20261113T102204Z-66d261b7/index.html
  - >-
    https://reports.1218217.xyz/reports/owlbear-muster-roll/20261113T104106Z-8b818dce/index.html
documentation:
  - >-
    backlog/docs/doc-1 -
    Epic-framework-independent-UI-behavior-and-simple-rendering.md
  - >-
    backlog/docs/doc-3 -
    Audit-and-experiment-UI-ownership-Storybook-and-registry.md
parent_task_id: TASK-61
type: spike
ordinal: 63000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner hypothesizes that visual modules can live independently and be checked in Storybook, possibly through a registry. The existing WindowFrame already accepts a navigation model; some sheet views still take editing or projection-related dependencies. Determine what isolation requires before making a registry, catalogue tool or full UI relocation mandatory.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A representative frame and one real sheet view can be exercised with explicit data and events without starting Owlbear or replica, or the exact blocking dependencies are documented.
- [x] #2 Static states and interactive navigation are distinguished; the experiment states which behavior Storybook can verify and which requires headless or browser tests.
- [x] #3 Plain imports and an explicit registry are compared against actual selection or discovery needs; H4 has a reasoned verdict, including rejection if it adds only indirection.
- [ ] #4 Storybook has a reproducible evidence-backed fit verdict for this project, including any configuration or dependency cost; no tool-only setup is called validation.
- [x] #5 H5 and affected ownership-map rows are updated with evidence and next work, without replacing the shared renderer.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Run an isolated Storybook experiment in a throwaway worktree, leaving application dependencies and production source unchanged. 2. Exercise real WindowFrame and sheet rendering with explicit fixtures and user events, without Owlbear or replica startup. 3. Compare direct imports with a minimal registry for a concrete lookup use, and distinguish visual interaction evidence from headless flow semantics. 4. Preserve reproducible commands and experiment evidence on the scratch branch; record H4/H5 verdicts and costs in the shared report before Claude Fable validation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-13: Fable review corrections preserve the original experiment. H4 is rejected on source-audit grounds, not equal-by-construction browser outcomes. H5 supports sampled capability only; comparative maintenance fit remains inconclusive. Fixture success needs record updates, only refused/not-allowed ran, artificial GM props and contexts are explicit. Guard was configured but not negatively exercised. Manifest46 is emitted; independent graph48 is loaded. Delta validation pending.

2026-11-13: Fable delta verdict ACCEPT on corrected claims; no blockers. Capability experiment is recorded and H4/H5/ownership map updated. AC#4 remains unchecked: comparative maintenance fit against the existing preview host has not been judged; measured cost includes 180 added lockfile entries, config and static catalogue output. No adoption or full-UI readiness is implied by the accepted report.
<!-- SECTION:NOTES:END -->
