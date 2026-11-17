---
id: TASK-83
title: Keep a pending player value visible until its edit settles
status: In Progress
assignee: []
created_date: '2026-11-16T15:15:00Z'
updated_date: '2026-11-17T09:28:00Z'
labels:
  - awaiting-review
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented and locked the public ProjectionStore regression: pending 20 / applied 30 remains shown and pending 20, then withdrawal shows 30 with no pending entry.

Durable red evidence: the locked test replayed in an owned detached worktree at 6c7d8b7b9be569e7de0f0f160bca16b05cbaa197; the focused command exited 1 with 20 pass / 1 fail and expected 20 / received 30. Log: /Users/seigiard/.claude/artifacts/preset-v4-78-87-20261117/task-83/focused-red-replay.log.

Stable source checks format, lint, typecheck, unit, browser 558/558, and build all exit 0 at addcd6c963c38e9d5b37e5e90a538600169db442. Durable logs: /Users/seigiard/.claude/artifacts/preset-v4-78-87-20261117/task-83/final-checks/checks.json.

The saved writer broad run is non-final because source changed during it; its bun log passes the new owner. No separate mutation/calibration project was warranted.

CURRENT: Implementation merged at 7335dbfd766d0747a835fd3d7c35a549f47aad0a. Pending player value 20 stays visible while the applied replica keeps newer value 30; withdrawal shows 30 and clears the marker. Focused 21/21 and all six checks pass at addcd6c. Remaining: closing integration review and final acceptance.
<!-- SECTION:NOTES:END -->
