---
id: TASK-83
title: Keep a pending player value visible until its edit settles
status: In Progress
assignee: []
created_date: '2026-11-16T15:15:00Z'
updated_date: '2026-11-17T07:57:00Z'
labels: []
dependencies: []
references:
  - src/ui/projection-store.ts
  - src/ui/block-projection.test.ts
priority: medium
type: bug
ordinal: 110000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-76 changed pending projection assembly to use the replica conflict merge. If a higher-version remote value reaches the same cell before the player receives an ACK, src/ui/projection-store.ts can display that remote value while its pending marker still describes the local intent. The reviewer reproduced shown value 30 with pending value 20. The owner requested this review follow-up rather than expanding TASK-76.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A remote value received before ACK does not replace the visible local pending intent for that same field.
- [ ] #2 The pending marker and visible value agree until acceptance, rejection or cancellation settles the edit.
- [ ] #3 A focused projection-store regression covers an applied value newer than the local pending cell and settlement afterward.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a public ProjectionStore regression for a pending cell value 20, newer applied value 30, and its later withdrawal.
2. Apply the same display-only pending overlay to shown records and PendingEntry records without changing $replica merging.
3. Run the focused owner and the required changed-path checks with durable logs.
<!-- SECTION:PLAN:END -->
