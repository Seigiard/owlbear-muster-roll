---
id: TASK-84
title: Avoid repeated serialization of the same sheet root
status: In Progress
assignee:
  - '@openai'
created_date: '2026-11-16T15:15:00Z'
updated_date: '2026-11-17T09:47:00Z'
labels:
  - active
dependencies: []
references:
  - src/ui/sheet/sheet-body.tsx
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
CURRENT: Queued after TASK-81. No implementation or validation yet in this pass; the signature deduplication and cross-tab invalidation criteria remain open.

CURRENT: Preparing the isolated signature-deduplication change. TASK-81 is closing as blocked and will not enter this baseline. Source implementation starts after its worker settles; no TASK-84 result is claimed yet.
<!-- SECTION:NOTES:END -->
