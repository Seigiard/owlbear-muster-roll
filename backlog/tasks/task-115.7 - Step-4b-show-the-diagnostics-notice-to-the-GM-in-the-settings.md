---
id: TASK-115.7
title: 'Step 4b: show the diagnostics notice to the GM in the settings'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-18T19:41:00Z'
updated_date: '2026-11-19T12:05:00Z'
labels:
  - ui
dependencies:
  - TASK-115.6
documentation:
  - >-
    _bmad-output/planning-artifacts/architecture/effect-sync-core-2026-11-18/DESIGN.md
parent_task_id: TASK-115
ordinal: 150000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Step 4 publishes recent replica failures as the `diagnostics` notice in the projection. Owner decision Q12: the window shows it to a GM only, as a collapsed block «Диагностика» in the settings; the banners players see do not change; the text lives in `src/copy.ts`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A GM window shows a collapsed «Диагностика» block in the settings listing the recent failures from the notice
- [ ] #2 A player window renders no new banner or block for `diagnostics`; the e2e suite for a player is unchanged
- [ ] #3 All interface text for the block is in `src/copy.ts`
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. A section «Диагностика» at the end of the GM's Settings (settings-view.tsx), a native <details> closed by default; its summary carries the count of recent failures.
2. Open, it lists the projection's diagnostics newest first: local time, tag, detail when present; an empty list says so.
3. All text in src/copy.ts; the player's window renders nothing for diagnostics (Settings is GM-only already).
4. tdd chain (run ~/.claude/artifacts/task-115-20261119/TASK-115.7): a unit test of the pure text/ordering helper and an e2e test on the mock adapter for a GM with an injected failure; full check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on task-115-7-diagnostics-ui. Settings ends with a native <details> «Диагностика», closed by default; its summary adds «Сбоев: N» when failures exist; opened, it lists the projection's diagnostics newest first as 'HH:MM:SS · tag · detail' (time by Intl.DateTimeFormat ru-RU), or «Сбоев нет». Text in copy.diagnostics. Players see no change (Settings is GM-only). Tests: diagnostics-text.test.ts and tests/diagnostics.e2e.ts (GM with a failure, GM with none, player). Checks: fmt, lint, typecheck, bun test, build; browser 586/586.
<!-- SECTION:NOTES:END -->
