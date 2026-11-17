---
id: TASK-98
title: Invalidate repeat-tab dice feedback after remote block edits
status: In Progress
assignee:
  - '@seigiard'
created_date: '2026-11-17T11:05:00Z'
updated_date: '2026-11-17T17:51:00Z'
labels:
  - format-v4
  - review-follow-up
  - minor
dependencies:
  - TASK-93
references:
  - TASK-84
  - src/ui/sheet/sheet-body.tsx
  - >-
    https://reports.1218217.xyz/reports/owlbear-muster-roll/20261117T105007Z-401dcadf/review.html#adversarial-claude-6
priority: medium
type: bug
ordinal: 125000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-84. The formula signature omits repeat-tab block records, so a remote change does not clear a stale dice message. Root deduplication is already implemented.

Evidence: confirmed code review of snapshot 7dcd100a74fe6d795259a2d63a337dfcb855c188. Existing green suites do not cover the defect; no new runtime reproduction or source repair is claimed.

Review finding: adversarial-claude-6

> The comment promises "the versions of the sheet's root and descendant blocks on every tab". The TASK-84 spec says to keep blocks from all tabs in the signature. The loop pushes `repKeyPrefix` only for repeat sections and repeat rows. A tab's `repeat.id` is never added, and the plain rows of a repeat tab are added as unused root `rowKey`s. `DiceButton` clears its message only when the signature changes. So a roll result or field error under a dice button in a tab block stays after another client changes that block. Only local edits still clear it. No test covers this.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The formula invalidation signature represents every relevant root, repeat-section, repeat-row and repeat-tab block once per computation across all tabs.
- [ ] #2 After a remote change to a repeat-tab block, its displayed stale dice result or field error is cleared through the existing consumer behavior.
- [ ] #3 Cross-tab dependent formulas, ordinary repeat behavior and local edit invalidation remain correct.
- [ ] #4 Coverage uses the public dice/field feedback boundary; it adds no source-shape assertion or broad benchmark project.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Lock a public mock-room browser regression: visible dice field error, a second GM edits the selected repeat-tab block, then the first client sees feedback clear.
2. Extend the consumer signature to include repeat-tab records once alongside root, repeat-section and repeat-row records.
3. Calibrate the locked regression, run the six required checks, then record objective evidence.
<!-- SECTION:PLAN:END -->
