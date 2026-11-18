---
id: TASK-111
title: Make unavailable warning identity explicit for older Builder drafts
status: To Do
assignee: []
created_date: '2026-11-18T09:52:00Z'
labels:
  - format-v4
  - optional-follow-up
dependencies: []
references:
  - TASK-80
  - src/builder/builder-store.ts
  - src/builder/document.ts
priority: low
type: enhancement
ordinal: 137000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Builder drafts saved before durable origin metadata contain an edited preset and the original preset, but no stable correspondence after moves or removals. TASK-80 now preserves that correspondence for new saves. Older drafts remain readable with all preset and snapshot data, but cannot reliably name the original block in destructive-change warnings. Positional guesses would name the wrong block. This compatibility limit was found during the TASK-80 warning-lifecycle repair; no affected live user is known, so it is outside preset-v4 completion scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Restoring an older draft preserves its preset, origin, filename and snapshot records.
- [ ] #2 When original block correspondence is unavailable, the Builder communicates that limitation without naming a guessed block.
- [ ] #3 Drafts with durable identity metadata retain exact loaded-block warnings after reorder, removal and reload.
<!-- AC:END -->
