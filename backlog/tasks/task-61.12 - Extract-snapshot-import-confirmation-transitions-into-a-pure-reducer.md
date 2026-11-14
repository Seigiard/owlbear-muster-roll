---
id: TASK-61.12
title: Extract snapshot-import confirmation transitions into a pure reducer
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-14T14:37:00Z'
updated_date: '2026-11-14T18:11:00Z'
labels:
  - architecture
  - ui-decoupling
dependencies: []
references:
  - TASK-61.10
  - src/ui/settings/snapshot-actions.tsx
  - docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md
parent_task_id: TASK-61
type: task
ordinal: 73000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-61.10. The wipe probe showed that a flow-specific pure reducer creates direct transition seams without moving command or browser effects out of the component. Apply that validated local boundary to the snapshot-import confirmation flow in src/ui/settings/snapshot-actions.tsx. The evidence is the locked reducer test src/ui/settings/wipe-actions-reducer.test.ts, its focused command, and calibration-2 regression results; use it as a boundary decision, not as a reason to build shared machinery. This task is intentionally unimplemented and must remain To Do until started.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The snapshot-import confirmation flow has a flow-specific pure reducer with direct transition coverage, while src/ui/settings/snapshot-actions.tsx owns useReducer.
- [x] #2 The component keeps snapshot-import command dispatch and browser effects, including refocus; the reducer has no React or DOM dependency.
- [x] #3 No generic or shared settings-flow or upload framework or helper is introduced.
- [x] #4 Existing snapshot-import browser behavior remains covered by its applicable unchanged browser tests.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the existing snapshot-import contract and extract its transitions into a flow-specific pure reducer; retain commands, file reads, async effects, and refocus in the component.
2. Add direct reducer coverage against the pre-refactor component and unchanged browser contracts, then calibrate assertions with faithful reducer mutations.
3. Run all repository checks and independent review; record evidence and finish only TASK-61.12.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Snapshot-import transitions now live in src/ui/settings/snapshot-actions-reducer.ts. The existing hook owns useReducer, file reads, snapshot checks, command sends, settlement effects, and refocus; no shared framework was added. All 17 direct tests have assertion-red calibration evidence across 18 faithful mutations, including a nonzero file-error counter. Existing browser tests are unchanged. All six gates passed: format, lint (170 existing warnings, no new warnings), typecheck, unit (2983 pass, 1 environment skip), browser (520 pass; 20 focused snapshot/catch-up pass), and build. Focused review reported both sources without degradation and no new findings. A pre-existing overlapping snapshot-file-read race candidate is recorded in deferred-work.md; no incident was reproduced or follow-up task created. Mock tests do not prove live Owlbear behavior. Evidence and triage are recorded in _bmad-output/implementation-artifacts/spec-task-61.12-snapshot-import-confirmation.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Snapshot-import confirmation now has a flow-specific pure reducer and 17 calibrated direct tests, while commands and browser effects stay in the existing component. Browser behavior remains covered by unchanged tests. All six repository gates passed, including 2983 unit tests and 520 browser tests; one unit test is skipped by its environment precondition. Independent review found no new defects. The pre-existing overlapping-file-read race candidate remains outside this refactor and is documented separately.
<!-- SECTION:FINAL_SUMMARY:END -->
