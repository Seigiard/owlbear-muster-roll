---
id: TASK-84
title: Avoid repeated serialization of the same sheet root
status: Done
assignee:
  - '@openai'
created_date: '2026-11-16T15:15:00Z'
updated_date: '2026-11-17T11:07:00Z'
labels:
  - follow-ups-open
dependencies: []
references:
  - src/ui/sheet/sheet-body.tsx
  - TASK-98
priority: low
type: enhancement
ordinal: 111000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After TASK-76 every plain row refers to one shared root block. sheetValuesSignature in src/ui/sheet/sheet-body.tsx still serializes that complete root once per plain row. A large sheet therefore repeats the same increasing work for each row instead of considering each unique block once. This is a code-traced scaling risk, not a measured performance incident. Deferred from the TASK-76 review at the owner request; do not add a broad benchmark project.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The formula invalidation signature considers each unique root or repeat block once per signature computation.
- [ ] #2 A change to any relevant cell on another tab still invalidates dependent formulas.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Collect each root block key once while scanning plain rows.
2. Keep all matching repeat blocks, including blocks from other tabs, in the formula invalidation signature.
3. Reuse the cross-tab dice browser owner and run the required stable full checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CURRENT STATUS — Done, review defects transferred to follow-up bugs.
Root serialization is deduplicated; the retained repeat-tab invalidation gap has a separate bug owner. Closed by explicit user decision with remaining review defects transferred to TASK-98. Unproven acceptance checkboxes remain unchecked; Done closes this delivery record and does not claim those defects were fixed. The branch remains blocked for release by TASK-89, TASK-90, TASK-91, TASK-92, TASK-93, TASK-94, TASK-95, TASK-96.
Each follow-up records the reviewed failure, source references, evidence limits and independently testable acceptance criteria. No source code changed during this transfer.

Earlier progress below is historical; the current status above supersedes it.

CURRENT: Queued after TASK-81. No implementation or validation yet in this pass; the signature deduplication and cross-tab invalidation criteria remain open.

CURRENT: Preparing the isolated signature-deduplication change. TASK-81 is closing as blocked and will not enter this baseline. Source implementation starts after its worker settles; no TASK-84 result is claimed yet.

CURRENT: Implemented the isolated signature deduplication. `rootKeys` records the shared sheet root once while the existing repeat-prefix scan continues to include matching repeat blocks across all tabs. No test or calibration was added: multiplicity has no independent consumer oracle, and the requested source-shape/instrumentation/benchmark alternatives are out of scope. Stable full checks all exit 0 at e83f7dd136ff0583192fe45f0deba10a16297b41; durable evidence: /Users/seigiard/.claude/artifacts/preset-v4-78-87-20261117/task-84/final-checks/checks.json. Awaiting parent closing review and acceptance.

CURRENT: Implementation is merged into feature/preset-v4-tasks-77-80. Stable source e83f7dd passes all six checks, including browser 558/558. Root serialization is deduplicated; the all-tab traversal and repeat-record scan remain unchanged. Remaining: closing integration review and final acceptance.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Root serialization is deduplicated; the retained repeat-tab invalidation gap has a separate bug owner. Closed by explicit user decision with remaining review defects transferred to TASK-98. Unproven acceptance checkboxes remain unchecked; Done closes this delivery record and does not claim those defects were fixed. The branch remains blocked for release by TASK-89, TASK-90, TASK-91, TASK-92, TASK-93, TASK-94, TASK-95, TASK-96.
<!-- SECTION:FINAL_SUMMARY:END -->
