---
id: TASK-92
title: Preserve section visibility in repeat-tab field and token authorization
status: Done
assignee: []
created_date: '2026-11-17T11:04:00Z'
updated_date: '2026-11-17T16:55:00Z'
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
- [x] #1 A player cannot edit a field in a GM-only section of a visible repeat tab through either a command or a raw proposal.
- [x] #2 A token cell in such a hidden section is not an allowed player link/open target.
- [x] #3 Inherited tab, section and row visibility is preserved for authorization; visible authorized fields remain editable and GM access remains unchanged.
- [x] #4 Public action-boundary regressions cover a visible repeat tab containing both visible and GM-only sections, without claiming record-level privacy.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Lock room-rig regressions for a visible repeat tab that contains both visible and GM-only source sections; exercise command, raw proposal, and token-open boundaries.
2. Preserve source section visibility when field and token authorization resolves repeat-tab targets.
3. Verify visible player fields and GM access remain allowed; retain TASK-90 lifecycle coverage.
4. Run focused evidence, calibration, and the required checks; request the parent browser slot before a full browser run.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Merge e83c2390f24b3756b3e1e08a66c0a77d91a1f987; lock/tip 7493f49c5ebd7f88bdfeb6754508dc0969cb9e8a. Deferred minor arch+quality-claude-1: identical linkTargetShownTo branches; see deferred-work.md. The positive control uses two 10ms queue turns.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Player commands and raw proposals cannot edit a GM-only source section inside a visible repeat tab. Hidden token targets cannot open for a player. Visible-field and GM controls remain allowed. Public action regressions are calibrated.

Verified on clean integrated source 077bb748d66e4ea8b5324399ce52b67cdbb5f37b: format, lint, typecheck, unit, browser and build all exit 0; 3413 unit pass, 1 skip; 570 browser pass with two workers. Cumulative review: mixed 6/6, then final 2/2 without gating findings. Mock-adapter evidence does not replace the owner-run live Owlbear gate TASK-86.
<!-- SECTION:FINAL_SUMMARY:END -->
