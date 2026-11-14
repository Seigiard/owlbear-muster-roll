---
id: TASK-61.9
title: Decide the builder preview's shown tab outside render
status: Done
assignee:
  - '@openai'
created_date: '2026-11-14T08:28:00Z'
updated_date: '2026-11-14T09:56:00Z'
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
- [x] #1 The shown-tab rule is a pure function or reducer in its own module with unit tests for: the selected item is on the shown tab (stays); on another tab (switches); in no tab (keeps the shown tab); no template tabs
- [x] #2 preview-pane.tsx no longer calls a state setter during render
- [x] #3 Builder browser tests pass unchanged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract the AD-23 shown-tab rule into src/builder/preview-navigation.ts while preserving template identity, selection outside tabs, template fallback, and empty-tab behavior.
2. Add locked unit coverage for staying, switching, retention, empty tabs, and no template; calibrate each assertion with a temporary mutation.
3. Integrate the reducer in src/builder/preview-pane.tsx without a render-time state setter, while keeping React effects and subscriptions in the component.
4. Reuse focused, full-unit, browser, format, lint, typecheck, and build evidence; confirm browser and source/test paths remain unchanged.
5. Record review triage, defer optional coverage follow-ups, and finalize the spec and task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Bootstrap extraction implemented in src/builder/preview-navigation.ts and wired into preview-pane.tsx without changing the render-time setter. The pure reducer preserves template identity, selected-tab switching, selection outside all tabs, template fallback, and empty-tab fallback. Focused unit tests and mutation checks remain for the next phase.

Final React integration is complete in src/builder/preview-pane.tsx. PreviewPane now uses useReducer, projects the current selection through previewNavigationReducer for an immediate shown-tab decision, and synchronizes the stable action in an effect; render-time state updates are removed. Focused tests, format, lint, typecheck, full unit tests, unchanged browser tests, and build all pass. Code commit: 0e5afc6a41ea2dbd8bf167821cb8f64496e3397b. Status remains In Progress pending review.

Review and finalization validation: AC1 is satisfied by the pure reducer and locked focused suite (5/5); all five mutation calibrations failed under their targeted regressions and restored green. AC2 is satisfied by the PreviewPane reducer/effect integration with no render-time state setter. AC3 is satisfied by unchanged builder browser tests (519 passed). Reused evidence also records full unit tests (2928 pass and 1 environment skip), format, lint, typecheck, and build passing. Source and test paths remain unchanged from e6033b3f9164437d677c081211e5cf62a616a192; docs-only finalization did not require rerunning the full suite, browser, or build.

Deferred optional coverage follow-ups, all minor/defer with no demonstrated behavior defect:
- Add nonempty cross-template isolation and foreign selected-tab unit cases.
- Add null-initial-state unit cases for first-tab and selected-tab opening.
- Add same-template stale-index composition coverage after tab removal.
- Add browser coverage that retains the reducer-selected tab after selecting a window.
Details and evidence: review-1.md and _bmad-output/implementation-artifacts/deferred-work.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The builder preview shown-tab rule now lives in a pure reducer and PreviewPane no longer updates state during render, preserving AD-23 behavior. The focused unit suite passed 5/5, all five mutation calibrations caught their regressions, and unchanged browser tests passed 519/519; full unit tests passed 2928 with 1 environment skip, and format, lint, typecheck, and build passed. Four optional coverage improvements were triaged minor/defer and recorded in deferred-work.md; no behavior defect or fix was needed.
<!-- SECTION:FINAL_SUMMARY:END -->
