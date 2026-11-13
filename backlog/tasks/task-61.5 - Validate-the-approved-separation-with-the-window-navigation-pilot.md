---
id: TASK-61.5
title: Validate the approved separation with the window navigation pilot
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-13T09:45:00Z'
updated_date: '2026-11-13T16:41:00Z'
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
Owner approved implementation of the real window state machine and verification of completeness/noncontradiction after rejecting the toy simulator. The old TASK-61.4 interview/prototype gate no longer blocks this slice; its broader research and Storybook fit questions stay open. The pilot now depends on the completed ownership audit TASK-61.2. Implementation is isolated on refactor/navigation-machine, preserving all original uncommitted research. bmad-build could not be loaded; use the available tdd chain with a repository task spec, full checks and review.

Implemented candidate 78c0bcef3399bed7865bb1039a428ce58deabf06 on refactor/navigation-machine: pure machine, headless integration, coherent projection snapshot and real renderer wiring. Clean candidate checks passed: 2860 unit tests, 512 browser tests, format, lint, types and build. Headless navigation/projection/integration group: 36 passing tests. Same-target stale reveal acknowledgement was reproduced and fixed with identity. Final review and remaining mutation calibration are in progress; no Done claim yet. Pilot evidence and caller responsibilities are recorded in epic doc-1.

Final implementation: a0968d8c690f0b153f1c02be9e0789d3a2afd637; tests abea39506bd488bf4e6f74a68b009f86b2ad39b9; spec 3e1808a4d74447c1b3c989bbee718bfba0da6d4e, branch refactor/navigation-machine. Accepted validation tree 18a2cf47de61b31438f25a7a059ee0ae072880a2 is identical to this packaged code/test/spec tree, preserved at refs/tdd/tdd-20261113-navigation/TASK-61.5/chain. Full check passed: format, lint (warnings only), typecheck, 2869 unit tests, 512 Chromium browser tests, build. Navigation/projection/integration: 45 tests; existing browser owners retained unchanged. Review: mixed 6/6 sources, eight routed fixes completed; final 2/2 sources, no blocking findings. Required final guard/publication mutations each failed on the protected assertion and restored clean. Independent oracles: baseline browser contracts and product/ADR rules; bounded traces are not a formal proof over arbitrary ids/presets. Epic doc-1 records caller knowledge, failed assumptions and H1-H6 limits. The previously deferred legacy setter/re-export and unused-field cleanup is complete; see the follow-up evidence below. No deployment or live Owlbear validation; the epic remains open and no second flow was started.

Owner-requested cleanup: commit 930bb90ade3f82be8d8d582137961ef407d038af removes unused projection setters, forwarding/entry exports, browserFocusInWindow and tabReveal. Existing access-panel setup now uses the normal projection boundary. The effect-queue assertion and integration claim-once tests retain behavioral ownership. Verification: 48 focused tests, 2869 unit tests, 512 Chromium tests, format, lint, typecheck and build passed. Direct diff verification found deletion-only production changes; existing type/build and behavioral gates cover the cleanup, so no additional review round was needed after the completed implementation review. A mock-room screenshot also confirms switching from Лира to Брок in the existing renderer. No live Owlbear check or deployment ran.

Simplified the pilot to the approved end state: src/ui/navigation.ts now exports one pure reducer; WindowRoot uses useReducer and owns command/browser effects; projection-store.ts, replica-client.ts, window-view.ts and access-panel.test.tsx are restored to master; integration/machine/model layers are deleted. Rewrote the ADR and task spec to remove the superseded projection/lifecycle/effect-consumption design. Focused reducer tests, format and typecheck pass; full verification is in the implementer report.

Batch 2 review fixes: focus-loss recovery now dispatches focus-actions; projection no-ops preserve state identity; navigation events require production values and no test-only fallbacks; master rule comments are restored. The task spec now documents that takenOpen remains the replay guard, and the reducer shape is recorded in this task plan and summary.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Navigation now uses one pure reducer in src/ui/navigation.ts, with useReducer and browser effects owned by WindowRoot. Required event values remove test-only fallbacks, refused deletes restore focus to the sheet actions control, open requests close only another sheet’s confirmation, and no-op projections preserve state identity. The ADR, task spec and backlog record the reducer shape; existing browser contracts remain unchanged and the wider epic stays open.
<!-- SECTION:FINAL_SUMMARY:END -->
