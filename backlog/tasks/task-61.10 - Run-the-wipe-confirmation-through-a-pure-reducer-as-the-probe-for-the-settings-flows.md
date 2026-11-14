---
id: TASK-61.10
title: >-
  Run the wipe confirmation through a pure reducer, as the probe for the
  settings flows
status: Done
assignee: []
created_date: '2026-11-14T08:28:00Z'
updated_date: '2026-11-14T15:28:00Z'
labels:
  - architecture
  - ui-decoupling
dependencies:
  - TASK-61.7
references:
  - src/ui/settings/wipe-actions.tsx
  - src/ui/preset-actions.tsx
  - src/ui/settings/snapshot-actions.tsx
  - docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md
parent_task_id: TASK-61
type: task
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Settings hold three confirmation flows with the same phases, file or check, then confirm, then command, then refocus: preset upload (src/ui/preset-actions.tsx, 367 lines), snapshot import (src/ui/settings/snapshot-actions.tsx, 299) and wipe (src/ui/settings/wipe-actions.tsx, 204). doc-3 warns against turning them into one upload framework with flags. Wipe is the smallest and the only destructive one, with tests/wipe.e2e.ts and CAP-31/AD-9 as independent oracles, so the owner chose it on 2026-11-14 as the probe: if the reducer shape pays here, preset upload and snapshot import get their own tasks; if not, the owner records them as excluded. The shape is the one in ADR 0002 and the CLAUDE.md block: reducer module, useReducer in the component, command and refocus in the component.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 wipe-actions.tsx keeps its confirmation, sending and outcome state in a reducer module with unit tests for: confirm; cancel; a second press while sending does nothing; a refused or timed-out outcome returns to idle with the failure shown; a catch-up in progress blocks confirm
- [x] #2 The component holds the reducer with useReducer and runs the wipe command and the refocus itself; no shared helper with the other settings flows
- [x] #3 tests/wipe.e2e.ts passes unchanged
- [x] #4 The task notes state in one paragraph whether the shape paid off (caller knowledge before and after) and name the decision for preset upload and snapshot import: tasks or owner exclusion
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract the existing wipe confirmation, sending and outcome transitions into the flow-specific pure reducer while keeping useReducer, wipe command dispatch and browser refocus in wipe-actions.tsx.
2. Lock and calibrate direct reducer coverage for confirmation, cancellation, repeated-send suppression, re-ask remounting, catch-up cancellation/blocking, repeated confirmation, successful settlement, catch-up message clearing, refused failure and timed-out failure.
3. Repair the review-confirmed re-ask regression without weakening the wiping or catch-up guards; keep tests/wipe.e2e.ts unchanged and do not add shared settings-flow machinery.
4. Verify the six required checks and final review, record the two deliberate deferred findings, and close this task without implementing TASK-61.11 or TASK-61.12.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Probe payoff: before this probe, the wipe confirmation transitions lived in React and were not direct unit seams; after the extraction, a flow-specific pure reducer has calibrated direct transition coverage for confirm, cancel, repeated-send suppression, refused/timed-out failure, and catch-up blocking, while the component retains command and browser focus effects. Evidence: the locked src/ui/settings/wipe-actions-reducer.test.ts passes with bun test src/ui/settings/wipe-actions-reducer.test.ts, and calibration-2 caught each faithful transition regression. Decision: the shape paid off, so create separate unimplemented follow-up tasks for the preset-upload and snapshot-import confirmation flows, preserving the local reducer/useReducer/component-effects boundary and avoiding a generic/shared framework.

Review-1 payoff and evidence: direct reducer tests cover confirm, cancel, repeated-send suppression while wiping, re-ask remounting, catch-up cancellation/blocking, repeated-confirm suppression, successful settlement, catch-up message clearing, refused outcomes, and timed-out outcomes. Calibration-2 calibrated confirm, cancel, wiping-ask suppression, the timed-out failure mutation, and catch-up blocking; review-1 records that the combined refused/timed-out assertion was not independently calibrated for refusal. The review re-ask assertion was red before the repair and passes after e711fd6. The repair allows a non-catching-up ask from idle or asking, increments ask to remount confirmation, and still refuses wiping and catch-up actions. The reducer shape paid off: caller knowledge moved from React transition details to a direct pure-reducer seam while command dispatch and browser refocus stayed in the component. Decision: create separate unimplemented To Do follow-ups TASK-61.11 for preset upload and TASK-61.12 for snapshot import, each with its own reducer and component effects; do not build a shared settings-flow helper.

Final closeout evidence: at calibrated code state 9f1a10b93ba06918a58a30ce491d5932ea776aa9, all 11 reducer assertions were independently calibrated with faithful red mutations and clean restores; the old combined refused/timed-out evidence is superseded. The focused reducer command passed 11/11, full bun test passed 2947 with 1 environment skip and 0 failures, browser passed 519, and format, lint, typecheck and build passed. Final review-2 accepted the state with no blocking findings. The optional stale/foreign-outcome unit polish and the pre-existing late catching-up refusal remain deferred in deferred-work.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the full wipe-confirmation extraction behind a flow-specific pure reducer. Before this task, caller knowledge of confirmation and outcome transitions lived in React; now the reducer owns those transitions while wipe-actions.tsx retains useReducer, command dispatch and browser refocus.

Acceptance criteria: #1 proven by 11 independently calibrated reducer assertions; #2 proven by the reducer/component boundary and passing checks; #3 proven by unchanged tests/wipe.e2e.ts and 519 passing browser tests; #4 recorded as the shape paying off, with separate unimplemented follow-ups TASK-61.11 and TASK-61.12.

Checks: format, lint, typecheck, full unit (2947 pass, 1 environment skip), browser (519 pass) and build (1669 modules) passed; final review-2 accepted with no blocking findings. Deferred: optional stale/foreign-outcome unit polish and the pre-existing late catching-up refusal remain recorded in deferred-work.md. TASK-61.11 and TASK-61.12 were not started.
<!-- SECTION:FINAL_SUMMARY:END -->
