---
id: TASK-61
title: 'Epic: separate UI behavior from rendering across Muster Roll'
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-11-13T09:43:00Z'
updated_date: '2026-11-13T14:12:00Z'
labels:
  - epic
  - architecture
  - ui-decoupling
dependencies: []
references:
  - >-
    https://reports.1218217.xyz/reports/owlbear-muster-roll/20261113T095653Z-ee83c4f3/index.html
  - >-
    https://reports.1218217.xyz/reports/owlbear-muster-roll/20261113T102204Z-66d261b7/index.html
  - >-
    https://reports.1218217.xyz/reports/owlbear-muster-roll/20261113T104106Z-8b818dce/index.html
documentation:
  - >-
    backlog/docs/doc-1 -
    Epic-framework-independent-UI-behavior-and-simple-rendering.md
  - >-
    backlog/docs/doc-2 -
    Research-framework-independent-navigation-and-visual-isolation.md
  - >-
    backlog/docs/doc-3 -
    Audit-and-experiment-UI-ownership-Storybook-and-registry.md
type: enhancement
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Window navigation currently combines workflow state, command outcomes, focus decisions and rendering in src/ui/main.tsx. The owner wants simpler rendering and framework-independent behavior across the UI, with isolated visual modules exercised outside a live room. The accepted direction in ADR-0002 is pure transitions inside a separate navigation module, retaining React rendering. Navigation is the first validation slice; its success alone does not finish the epic. Machine libraries, shared event delivery, a visual registry and Storybook adoption remain hypotheses or later decisions, not implied implementation choices. doc-1 preserves the overall goal and coverage; doc-3 records the full audit, experiment and Claude Fable validation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An owner-confirmed end-state document covers room window, builder, picker and shared preview rendering, with explicit workflow-state and rendering ownership.
- [ ] #2 Each hypothesis has a recorded verdict, independent evidence, and consequences for the remaining UI; untested hypotheses stay explicit.
- [ ] #3 The navigation pilot preserves selection, open requests, command outcomes, role changes and focus behavior while exposing behavior independently of React.
- [ ] #4 A second UI flow validates transfer of the chosen separation or records why a different module shape is needed.
- [ ] #5 Visual modules can be exercised without starting Owlbear or replica; the catalogue and isolation approach have evidence rather than a tool-only setup.
- [ ] #6 Every inventoried UI flow is migrated, shown to already meet the goal, or excluded by an explicit owner decision; passing the navigation pilot alone cannot close the epic.
- [ ] #7 Architecture decisions, glossary terms where needed, test ownership and remaining work agree with the approved end state.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-13: recorded the owner-confirmed overall direction and navigation-first validation in doc-1. Created TASK-61.1 through TASK-61.7 with dependencies. Navigation success is explicitly insufficient for epic completion. Production-code implementation remains gated by TASK-61.4.

2026-11-13: ADR-0002 records the accepted navigation shape. The 64-module functional audit is complete (TASK-61.2 Done). Storybook capability was demonstrated within the documented fixture limits; registry is unnecessary for current scope. Claude Fable returned REVISE, then ACCEPT on all five corrections with no blockers. Both verdicts and unchanged experiment evidence are preserved in the HTML report/doc-3. TASK-61.3 AC#4 remains open for comparative catalogue maintenance fit; no production migration or catalogue adoption was approved.

TASK-61.5 navigation pilot is Done: implementation a0968d8c690f0b153f1c02be9e0789d3a2afd637, existing renderer connected to pure navigation transitions and headless integration. Full checks: 2869 unit tests, 512 browser tests, format/lint/types/build; confirming review 2/2 without blocking findings. Doc-1 records before/after ownership, failed assumptions and bounded evidence. This does not complete TASK-61; second-flow validation, Storybook fit and remaining UI coverage stay open.
<!-- SECTION:NOTES:END -->
