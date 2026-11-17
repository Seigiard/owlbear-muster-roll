---
id: TASK-96
title: Restore repeat-tab preview editing and token reveal context
status: In Progress
assignee:
  - '@seigiard'
created_date: '2026-11-17T11:05:00Z'
updated_date: '2026-11-17T15:16:00Z'
labels:
  - format-v4
  - review-follow-up
  - major
  - release-blocker
dependencies: []
references:
  - TASK-78
  - src/ui/sheet/sheet-body.tsx
  - >-
    https://reports.1218217.xyz/reports/owlbear-muster-roll/20261117T105007Z-401dcadf/review.html#bugs+impl-codex-7
priority: high
type: bug
ordinal: 123000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-78. Tab-block rows lack the block context used by preview edit entry and token reveal, so editing does not start and a linked cell can remain off screen.

Evidence: confirmed code review of snapshot 7dcd100a74fe6d795259a2d63a337dfcb855c188. Existing green suites do not cover the defect; no new runtime reproduction or source repair is claimed.

Review finding: bugs+impl-codex-7

> `tabBlock` is passed to PlainContent, but the plain rows of a tab never get an ancestor with `data-repeat-block`. In the Builder, `repeatBlockId` returns null, so `previewCellKey` ends with an empty instanceId while `SheetCell` builds its key with the real one. The keys do not match, so a second click or Enter does not start editing. When a linked token opens, the reveal effect in SheetBody looks for the missing `data-repeat-block` container, finds no token cell, and ends without scrolling or focusing. On a long tab the target stays off screen. The e2e test (tests/repeat-tabs.e2e.ts:383) checks only the selected tab and hp, so it does not catch this.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Double-click or Enter starts editing a field in the selected repeat-tab block in Builder preview.
- [ ] #2 The edit changes only the selected block's snapshot value and preserves the existing role/write policy.
- [ ] #3 Opening a linked token cell below the visible area of a repeat tab scrolls to that cell and gives it focus when the open-flow focus policy requires it.
- [ ] #4 Browser regressions verify actual edit entry/value output and below-fold reveal/focus, not only selected-tab labels.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add the selected repeat-tab block as the body context so Builder preview edit entry keeps the block instance id.
2. Add the same repeat-block context to the selected tab body so token reveal finds, scrolls, and focuses its target under the established policy.
3. Lock focused browser regressions in a new dedicated test file for Builder edit/value output and below-fold token reveal/focus.
4. Run focused browser evidence and the required source checks; leave full browser-suite scheduling to the parent.
<!-- SECTION:PLAN:END -->
