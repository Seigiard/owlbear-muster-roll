---
id: TASK-61.5
title: Validate the approved separation with the window navigation pilot
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-13T09:45:00Z'
updated_date: '2026-11-14T05:51:00Z'
labels:
  - architecture
  - ui-decoupling
dependencies:
  - TASK-61.2
references:
  - src/ui/main.tsx
documentation:
  - >-
    backlog/docs/doc-1 -
    Epic-framework-independent-UI-behavior-and-simple-rendering.md
parent_task_id: TASK-61
type: task
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Navigation is the first real test of the approved separation, not the completion of the UI epic. Its current caller owns preset arrival, selected sheets and tabs, token open requests, create/delete outcomes, demotion and mount-dependent focus work. Implement only the approved slice after re-reading its current code and preparing the project-required task spec.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Navigation rules can be driven and observed without React, DOM, Owlbear or replica startup, through the same interface the window uses.
- [x] #2 The React caller renders one coherent navigation view and forwards events; workflow transitions no longer depend on render-phase state updates.
- [x] #3 Current selection, hidden-tab fallback, repeated open handling, command outcomes, demotion and focus/reveal behavior have independent behavioral checks at the appropriate test surface.
- [x] #4 Lifecycle and asynchronous effect delivery handle stale completions and repeated mounting without introducing a global event bus or new ownership of replica data.
- [x] #5 Existing relevant browser contracts stay covered; any moved or retired check names its replacement and the contract it protects.
- [x] #6 The epic records pilot evidence, failed assumptions, caller knowledge before/after and limits on generalizing the result; the epic remains open.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep navigation decisions in one pure transition(state, event) reducer, with required event values and sheet-key stale checks.
2. Keep WindowRoot responsible for useReducer, command handlers, browser effects and derived sidebar selection; keep room data in existing atoms and useWindowView.
3. Record the reducer boundary in the ADR and task spec, and keep the open-request replay guard and focus recovery behavior explicit.
4. Verify focused reducer behavior, full unit checks, Chromium browser contracts, formatting, lint, types and build; keep the wider UI-separation epic open.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner approved implementation of the real window navigation module and verification of completeness and noncontradiction, superseding the TASK-61.4 gate for this slice; its broader research and Storybook fit questions stay open. The work is isolated on `refactor/navigation-machine`, pull request #1.

First implementation: a pure machine, a headless integration layer, a coherent projection snapshot published by the store, effect objects with ids and claim-once delivery, sampled browser focus and reveal identity. It passed the full check. The owner's review found the machinery around the rules larger than the rules: five mechanisms for running an effect once, a browser-focus round trip for a three-line DOM check, and store and client changes that nothing else needed. It was removed.

Final implementation: `src/ui/navigation.ts` exports one pure reducer, `transition(state, event)`, with required event values and sheet-key stale checks. `WindowRoot` uses `useReducer`, sends commands from its handlers and runs browser effects keyed on `tabReveal`, `takenOpen` and `focusAfterLoss`; `takenOpen` stays as the open-request replay guard. `projection-store.ts`, `replica-client.ts`, `window-view.ts` and `access-panel.test.tsx` match `master`. The ADR and the task spec describe the reducer boundary. Review fixes: focus-loss recovery dispatches `focus-actions`, no-op projections keep state identity, refused deletes restore focus to the sheet actions control, and an open request closes only another sheet's confirmation.

Verification: 23 reducer tests; `bun test` 2863 pass; `bun run test:browser` 512 passed with `tests/` unchanged from `master`; format, lint, typecheck and build pass. Known limit: after a refused delete, a second confirm of the same sheet within the command timeout does not move the focus after the second succeeds. No live Owlbear check or deployment ran; the epic remains open and no second flow was started.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Navigation now uses one pure reducer in src/ui/navigation.ts, with useReducer and browser effects owned by WindowRoot. Required event values remove test-only fallbacks, refused deletes restore focus to the sheet actions control, open requests close only another sheet’s confirmation, and no-op projections preserve state identity. The ADR, task spec and backlog record the reducer shape; existing browser contracts remain unchanged and the wider epic stays open.
<!-- SECTION:FINAL_SUMMARY:END -->
