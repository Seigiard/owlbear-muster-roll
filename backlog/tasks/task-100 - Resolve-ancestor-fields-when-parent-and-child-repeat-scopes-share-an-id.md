---
id: TASK-100
title: Resolve ancestor fields when parent and child repeat scopes share an id
status: Done
assignee:
  - '@seigiard'
created_date: '2026-11-17T23:10:00Z'
updated_date: '2026-11-20T07:11:00Z'
labels:
  - format-v4
  - review-follow-up
dependencies: []
references:
  - TASK-79
  - src/core/formula-evaluate.ts
  - _bmad-output/implementation-artifacts/task-79-window4-review.md
priority: low
type: bug
ordinal: 127000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Window-4 review finding bugs+impl-codex-7 at integration 62044f2 traces a valid but constructed preset whose parent and child both use repeat id npc. Formula lookup can treat the parent scope path as the child path and read ownBlock instead of the ancestor, returning a field error. No separate user occurrence or parent-run runtime reproduction is claimed. This is deferred from the bounded TASK-79 review; do not silently narrow the parent-local id contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A public formula or dice regression reproduces the ancestor lookup failure for a parent and child that share a repeat id, or recorded evidence disproves the traced path.
- [x] #2 A nested formula reads the owning ancestor field when parent and child ids match; nearest-field shadowing and ordinary distinct-id lookup remain correct.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce through rollDiceCell on a v4 preset with repeated tab and section IDs.
2. Distinguish the rolled scope from its ancestor by the full ordered scope path. Keep field resolution, local shown values, and parent-local IDs unchanged.
3. Verify the regression, the nearest-field and distinct-ID cases, and the changed-path checks. Open a PR with automerge.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Public roll regression on a fully parsed v4 preset: before the fix, 2 regressions returned field errors (bonus and weapon_die); the nearest-field and distinct-id controls passed. After comparing complete scope paths, the dice, formula and window-local value suites passed 108/108.

Independent review strengthened the roll fixture with a second parent that reuses the same child block id. Complete local checks passed: format, lint (0 errors), typecheck, 3,661 unit tests (one skip), 588 Chromium tests, all 55 mutants killed, build, and formal drift. No browser retries or deferred work.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Dice cells in repeat sections read the enclosing repeat tab’s numeric and dice-choice fields even when both scopes share an id. The evaluator compares entire scope paths before using the rolled block’s values. The public roll test reproduces the original field errors and confirms the ancestor roll, nearest-field shadowing, and lookup across distinct ids.
<!-- SECTION:FINAL_SUMMARY:END -->
