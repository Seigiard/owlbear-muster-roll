---
id: TASK-93
title: Allow dice cells to roll with their repeat-tab block values
status: To Do
assignee: []
created_date: '2026-11-17T11:05:00Z'
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
- [ ] #1 A repeat-tab block with hp=7 rolls 1d1 + hp as 8 through the normal room roll path.
- [ ] #2 The same supported roll succeeds in the Builder preview and reads values from the selected block rather than a sibling or the root.
- [ ] #3 Ordinary root, repeat-section and repeat-row dice behavior remains unchanged.
- [ ] #4 Consumer regressions demonstrate the reported not-dice failure before repair and successful room/preview rolls after repair.
<!-- AC:END -->
