---
id: TASK-151
title: Focus a leading select field when adding a repeat block
status: To Do
assignee: []
created_date: '2026-11-20T14:18:00Z'
labels: []
dependencies: []
references:
  - backlog/tasks/task-140 - Let-the-React-Compiler-transform-RepeatContent.md
priority: low
type: bug
ordinal: 184000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a GM adds a repeat block whose first field is a select field, the window skips it and focuses the next text field. In the mock browser, an editable repeat section with select field `armor` followed by text name field `attack` produced `firstField: SELECT` and `focusedField: TEXTAREA` (`attack`). `src/ui/sheet/use-repeat-blocks.ts` uses `input, textarea` to find the focus target. This predates TASK-140, which does not change focus behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given one GM in one window and a repeat section with an editable select field before its text name field, pressing Add moves focus to the select field of the new repeat block.
- [ ] #2 The existing focus behavior for text-first repeat blocks and after deletion remains unchanged.
<!-- AC:END -->
