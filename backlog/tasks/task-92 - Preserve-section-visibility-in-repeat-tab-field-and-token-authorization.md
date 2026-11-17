---
id: TASK-92
title: Preserve section visibility in repeat-tab field and token authorization
status: In Progress
assignee: []
created_date: '2026-11-17T11:04:00Z'
updated_date: '2026-11-17T15:30:00Z'
labels:
  - format-v4
  - review-follow-up
  - major
  - release-blocker
dependencies: []
references:
  - TASK-78
  - src/core/preset.ts
  - >-
    https://reports.1218217.xyz/reports/owlbear-muster-roll/20261117T105007Z-401dcadf/review.html#bugs+impl-codex-2
priority: high
type: bug
ordinal: 119000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-78. The tab adapter drops a nested section's GM-only visibility. A hidden field or token target can remain accessible through actions despite being hidden by the UI.

Evidence: confirmed code review of snapshot 7dcd100a74fe6d795259a2d63a337dfcb855c188. Existing green suites do not cover the defect; no new runtime reproduction or source repair is claimed.

Review finding: bugs+impl-codex-2

> A visible repeat tab can contain a section with `visibility: 'gm'` that holds a plain row with a `secret` field. The new adapter moves that row into a synthetic section that keeps only the tab's own visibility. `fieldTargetShownTo` then sees an accessible section and row. A player with edit access can send a `field-patch` on `secret`, and both compose and `proposalJudgement` allow it. For token cells, the same adapter lets `linkTargetShownTo` accept a link to a hidden section. The UI still hides the original section, but the action checks lose its restriction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A player cannot edit a field in a GM-only section of a visible repeat tab through either a command or a raw proposal.
- [ ] #2 A token cell in such a hidden section is not an allowed player link/open target.
- [ ] #3 Inherited tab, section and row visibility is preserved for authorization; visible authorized fields remain editable and GM access remains unchanged.
- [ ] #4 Public action-boundary regressions cover a visible repeat tab containing both visible and GM-only sections, without claiming record-level privacy.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Lock room-rig regressions for a visible repeat tab that contains both visible and GM-only source sections; exercise command, raw proposal, and token-open boundaries.
2. Preserve source section visibility when field and token authorization resolves repeat-tab targets.
3. Verify visible player fields and GM access remain allowed; retain TASK-90 lifecycle coverage.
4. Run focused evidence, calibration, and the required checks; request the parent browser slot before a full browser run.
<!-- SECTION:PLAN:END -->
