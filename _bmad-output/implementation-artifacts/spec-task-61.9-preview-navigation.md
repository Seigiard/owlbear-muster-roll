---
title: 'Extract builder preview tab navigation'
type: 'refactor'
created: '2026-11-14'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The builder preview applies the AD-23 shown-tab rule by updating React state during render. This keeps the rule coupled to rendering and prevents direct unit testing.

**Approach:** Extract the existing shown-tab transition into a pure module with unchanged behavior, including template identity, selections outside all tabs, template fallback, and empty-tab handling. Keep the component responsible for React state and rendering integration.

</frozen-after-approval>

## Implementation Notes

- Bootstrap is limited to the mechanical production extraction authorized for TASK-61.9; no test files or browser sources are changed.
- Final integration uses `useReducer` in `PreviewPane`, projects the current selection through `previewNavigationReducer` for an immediate tab decision, and synchronizes reducer state from an effect with a stable action. The render-time state setter is gone; template identity, previous-tab retention, template fallback, and empty-tab fallback remain unchanged.
- Validation passed on the final implementation state: focused navigation tests 5/5, format, lint, typecheck, full unit tests (2928 pass and 1 environment skip), browser tests (519 pass), and build. Raw logs and verdicts are in `implementation-checks/` under the TDD run directory.
- Review triage is complete. Four optional coverage improvements were judged minor and deferred; no behavior defect or code fix was found. The decisions and evidence are recorded in `review-1.md`.
- Finalization reuses the validated state at `e6033b3f9164437d677c081211e5cf62a616a192`; source and test paths remain unchanged.

## Review Triage Log

- Cross-template isolation and foreign selected-tab cases — **minor/defer**: the reducer compares template UIDs in selection and prior-state branches; no behavior defect was demonstrated.
- Null-initial-state cases — **minor/defer**: the reducer resolves first-tab and selected-tab opening, and the unchanged browser suite covers opening behavior.
- Same-template stale index after tab removal — **minor/defer**: existing `openTabIndex` fallback owns index normalization; no behavior failure was demonstrated.
- Browser retention after selecting a window — **minor/defer**: the current e2e reselects the target tab, while reducer retention was calibrated and 519 browser tests passed unchanged.
