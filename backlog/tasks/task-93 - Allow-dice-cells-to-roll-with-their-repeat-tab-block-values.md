---
id: TASK-93
title: Allow dice cells to roll with their repeat-tab block values
status: Done
assignee:
  - '@seigiard'
created_date: '2026-11-17T11:05:00Z'
updated_date: '2026-11-17T16:55:00Z'
labels:
  - format-v4
  - review-follow-up
  - major
  - release-blocker
dependencies: []
references:
  - TASK-78
  - src/core/dice-roll.ts
  - >-
    https://reports.1218217.xyz/reports/owlbear-muster-roll/20261117T105007Z-401dcadf/review.html#arch+quality-claude-5
priority: high
type: bug
ordinal: 120000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-78. Dice cells inside repeat-tab blocks receive an instance id, but the roll path does not recognize the tab repeat scope and returns not-dice.

Evidence: confirmed code review of snapshot 7dcd100a74fe6d795259a2d63a337dfcb855c188. Existing green suites do not cover the defect; no new runtime reproduction or source repair is claimed.

Review finding: arch+quality-claude-5

> `plainRows` (src/ui/sheet/preset-section.tsx:860) now passes the tab block's instanceId to each dice cell. `prepareDiceRoll` computes `repeat` from `section.repeat`/`row.repeat` only and ignores `tab.repeat`. For a plain row on a repeat tab, `repeat` is false while `instanceId !== null`, so the guard returns `err({code:'not-dice'})`, even for `1d6`. `blockValues` also cannot resolve the tab's scope id. Every roll fails, both in the room (roll-flow.ts) and in the Builder preview. The repeat-tab e2e preset has no dice cell, so tests pass anyway.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A repeat-tab block with hp=7 rolls 1d1 + hp as 8 through the normal room roll path.
- [x] #2 The same supported roll succeeds in the Builder preview and reads values from the selected block rather than a sibling or the root.
- [x] #3 Ordinary root, repeat-section and repeat-row dice behavior remains unchanged.
- [x] #4 Consumer regressions demonstrate the reported not-dice failure before repair and successful room/preview rolls after repair.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Lock core and dedicated repeat-tab room/Builder consumer regressions with distinct root, selected and sibling hp values.
2. Extend dice preparation to recognize tab repeat scope and resolve the selected block.
3. Calibrate each consumer assertion, then run required source checks; coordinate before a full browser suite.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Initial merge c4c7580d35cefeebd261316d4b053a97d2e7f7bf; cross-section lock 08a18e0a3b3031050ef0d68bca20612d152ef06c and repair 077bb748d66e4ea8b5324399ce52b67cdbb5f37b. Numeric, dice-choice and field-label lookups share the complete repeat scope. Exact-result calibration fails on the restored numeric defect. TASK-98 still owns remote feedback invalidation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Repeat-tab dice resolve values from the selected block, including fields in other plain sections. Core and Room assert 1d1 + hp = 8 for hp=7. Builder Preview proves selected-block field-error and successful empty-feedback states; it does not display the numeric result. Existing dice suites remain green.

Verified on clean integrated source 077bb748d66e4ea8b5324399ce52b67cdbb5f37b: format, lint, typecheck, unit, browser and build all exit 0; 3413 unit pass, 1 skip; 570 browser pass with two workers. Cumulative review: mixed 6/6, then final 2/2 without gating findings. Mock-adapter evidence does not replace the owner-run live Owlbear gate TASK-86.
<!-- SECTION:FINAL_SUMMARY:END -->
