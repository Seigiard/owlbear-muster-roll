---
id: TASK-90
title: Reject player repeat-tab creation and deletion at the receiving GM
status: Done
assignee: []
created_date: '2026-11-17T11:03:00Z'
updated_date: '2026-11-17T16:55:00Z'
labels:
  - format-v4
  - review-follow-up
  - critical
  - release-blocker
dependencies: []
references:
  - TASK-78
  - src/core/access.ts
  - >-
    https://reports.1218217.xyz/reports/owlbear-muster-roll/20261117T105007Z-401dcadf/review.html#bugs+impl-codex-1
priority: high
type: bug
ordinal: 117000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-78. A player with field-edit access can bypass its local engine and send a raw proposal that creates or deletes a tab block.

Evidence: confirmed code review of snapshot 7dcd100a74fe6d795259a2d63a337dfcb855c188. Existing green suites do not cover the defect; no new runtime reproduction or source repair is claimed.

Review finding: bugs+impl-codex-1

> TASK78 makes add and delete on a repeat tab GM-only. The diff enforces this only in `src/replica/pending-edits.ts:103-108`, which runs in the player's own replica. The forged-command e2e test covers only that client-side path. On the GM side (`room-protocol.ts` → `receiveProposal` → `checkProposal` → `proposalJudgement`), there is no repeat-tab check. A tombstone (`d: null`) on `blk:<sheet>:<tabScope>:<id>`, or a new rep key with a valid `l`, is allowed whenever `playerMayEditField(..., {kind:'rep', sectionId})` is true. `repeatSectionPlace` now resolves repeat tabs, so this is reachable. A player with edit access can send a raw propose message from a modified client or the console. The GM then commits the deletion of a block, including its values and token links, or the creation of a new block.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A raw player proposal that creates a repeat-tab block is refused by the receiving GM without persistence, commit or ACK.
- [x] #2 A raw player proposal that deletes a repeat-tab block is refused without changing its values or token links.
- [x] #3 Authorized player field edits to existing visible tab blocks and GM lifecycle actions remain allowed.
- [x] #4 Regression coverage exercises public receiving-GM proposal admission, not only the player's local command guard or hidden UI.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Lock room-rig regressions for raw player repeat-tab creation and deletion at a real receiving GM, including persistence, commit/ACK, value and token-link observations.
2. Preserve public admission of an authorized visible-block field edit and existing GM lifecycle behavior.
3. Restrict `src/core/access.ts` lifecycle admission without changing player-local guards or broader policy.
4. Calibrate protected assertions and run the required source checks; request the parent browser slot before the full browser suite.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Merge 2946a9727428b162193352cb5756179d893e1945; ticket lock/tip 66189083ddee1ddab61ab056d46655759f245cb8.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The receiving GM refuses raw player creation and deletion of repeat-tab blocks. Existing block field edits remain allowed; rejected deletion preserves values and token links. Public proposal owners are calibrated.

Verified on clean integrated source 077bb748d66e4ea8b5324399ce52b67cdbb5f37b: format, lint, typecheck, unit, browser and build all exit 0; 3413 unit pass, 1 skip; 570 browser pass with two workers. Cumulative review: mixed 6/6, then final 2/2 without gating findings. Mock-adapter evidence does not replace the owner-run live Owlbear gate TASK-86.
<!-- SECTION:FINAL_SUMMARY:END -->
