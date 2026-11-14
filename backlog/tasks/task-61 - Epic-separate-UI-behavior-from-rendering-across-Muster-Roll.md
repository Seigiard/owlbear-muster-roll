---
id: TASK-61
title: 'Epic: separate UI behavior from rendering across Muster Roll'
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-13T09:43:00Z'
updated_date: '2026-11-14T20:29:00Z'
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
Before TASK-61.5, window navigation combined workflow state, command outcomes, focus decisions and rendering in src/ui/main.tsx. The owner wants simpler rendering and framework-independent behavior across the UI, with isolated visual modules exercised outside a live room. The accepted direction in ADR-0002 is pure transitions inside a separate navigation module, retaining React rendering. Navigation is the first validation slice; its success alone does not finish the epic. Machine libraries, shared event delivery, a visual registry and Storybook adoption remain hypotheses or later decisions, not implied implementation choices. doc-1 preserves the overall goal and coverage; doc-3 records the full audit, the experiment and the independent review of both.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An owner-confirmed end-state document covers room window, builder, picker and shared preview rendering, with explicit workflow-state and rendering ownership.
- [x] #2 Each hypothesis has a recorded verdict, independent evidence, and consequences for the remaining UI; untested hypotheses stay explicit.
- [x] #3 The navigation pilot preserves selection, open requests, command outcomes, role changes and focus behavior while exposing behavior independently of React.
- [x] #4 A second UI flow validates transfer of the chosen separation or records why a different module shape is needed.
- [x] #5 Visual modules can be exercised without starting Owlbear or replica; the catalogue and isolation approach have evidence rather than a tool-only setup.
- [x] #6 Every inventoried UI flow is migrated, shown to already meet the goal, or excluded by an explicit owner decision; passing the navigation pilot alone cannot close the epic.
- [x] #7 Architecture decisions, glossary terms where needed, test ownership and remaining work agree with the approved end state.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify all current child tasks and their acceptance criteria are Done. 2. Reconcile doc-1 hypotheses, final coverage, work graph and epic closeout evidence. 3. Align the ADR rollout statement and picker spec status with the completed migrations and owner live verification. 4. Close the seven epic criteria and publish a documentation-only PR.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-13: recorded the owner-confirmed overall direction and navigation-first validation in doc-1. Created TASK-61.1 through TASK-61.7 with dependencies. Navigation success is explicitly insufficient for epic completion. Production-code implementation remains gated by TASK-61.4.

2026-11-13: ADR-0002 records the accepted navigation shape. The 64-module functional audit is complete (TASK-61.2 Done). Storybook capability was demonstrated within the documented fixture limits; registry is unnecessary for current scope. An independent review of the research returned corrections, all accepted; the verdicts and the unchanged experiment evidence are preserved in the HTML report and doc-3. TASK-61.3 AC#4 remains open for comparative catalogue maintenance fit; no production migration or catalogue adoption was approved.

2026-11-14: TASK-61.5 navigation pilot is Done on pull request #1 (`refactor/navigation-machine`). The window runs navigation through one pure reducer in `src/ui/navigation.ts`, with `useReducer`, command handlers and browser effects in `WindowRoot`. Full checks: 2863 unit tests, 512 browser tests, format, lint, types and build. Doc-1 records before/after ownership, the rejected machinery and the bounded evidence. This does not complete TASK-61; second-flow validation, Storybook fit and remaining UI coverage stay open.

2026-11-14: TASK-61.1 closed on doc-2, ADR 0002 and the pilot. TASK-61.3 closed: Storybook rejected for the current scope by the owner, the preview host stays the catalogue; H4 rejected, H5 closed. Open children: TASK-61.6 (second flow, unblocked) and TASK-61.7.

Epic closeout verified all 11 current child tasks as Done with every child acceptance criterion checked. TASK-61.4 remains archived as a superseded approval gate.
AC1: doc-1 records the owner-confirmed end state and target ownership for the window, builder, picker and shared rendering.
AC2: H1-H6 have bounded evidence-backed verdicts; registry and Storybook adoption are rejected for the accepted scope, and untested outbound-publication requirements remain explicit.
AC3: TASK-61.5 provides the navigation reducer, preserved browser behavior and recorded passing checks.
AC4: TASK-61.6 provides the materially different picker experiment; TASK-61.8 adds production integration and the owner's four successful live label/popover checks.
AC5: TASK-61.3/doc-3 demonstrate isolated real visual modules without Owlbear or replica; the preview host remains the catalogue.
AC6: every coverage row now meets the goal with evidence or retains an explicit owner exclusion. Required production migrations TASK-61.8 through TASK-61.12 are all Done.
AC7: doc-1, ADR 0002 and the picker spec agree on completed rollout, reducer/component ownership, direct tests, browser-effect tests and remaining limits. No glossary meaning changed. Deferred issues and the separate TASK-63 epic are not silently claimed complete.
This closeout changes documentation only; it does not claim a new runtime test run or new SDK coverage.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The approved UI-separation epic is complete. All 11 current child tasks are Done, the five production migrations are complete, and the owner confirmed the four live picker label/popover scenarios. The navigation and second-flow evidence, visual-isolation verdicts, final coverage map, architecture ownership and seven epic acceptance criteria are reconciled. Field editing, repeat blocks, builder tree collapse, rename consequences and small integration cleanups retain explicit owner exclusions. Deferred limitations and TASK-63 remain separate work; no code behavior changes in this closeout.
<!-- SECTION:FINAL_SUMMARY:END -->
