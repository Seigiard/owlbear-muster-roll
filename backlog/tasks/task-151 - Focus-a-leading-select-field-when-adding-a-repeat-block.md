---
id: TASK-151
title: Focus a leading select field when adding a repeat block
status: Done
assignee:
  - '@seigiard'
created_date: '2026-11-20T14:18:00Z'
updated_date: '2026-11-20T15:43:00Z'
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
- [x] #1 Given one GM in one window and a repeat section with an editable select field before its text name field, pressing Add moves focus to the select field of the new repeat block.
- [x] #2 The existing focus behavior for text-first repeat blocks and after deletion remains unchanged.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm the leading select focus target in Chromium on the current window.
2. Lock a browser regression for Add with an editable select before the text name field.
3. Update Add focus targeting only; verify existing text-first and deletion focus and run the project gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Chromium confirmed the field is a native SELECT that accepts focus. Before the fix, Add focused the attack textarea; the new Playwright test found the Броня combobox inactive. After including select in the Add focus query, all 16 repeat-block tests passed. They include text-first Add and focus on the next Delete button or Add after deletion. The full Chromium run with one worker passed all 590 tests before merging the TASK-142 test-only changes. Independent review reported no actionable findings.

After merging master, the repeat-blocks, player and selection browser files passed all 39 tests with one worker. Format, lint, typecheck, unit tests (3680 passed, 1 skipped), build, formal drift, and the mutation check (55 killed, 0 survived, 0 stale) passed. The full browser run had no timeouts, so no TASK-142 follow-up was needed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Add now focuses an editable select field when it comes first in a new repeat block. Text-first Add and both deletion focus targets are unchanged. The new Chromium regression failed before the fix and passed after it. No deferred work.
<!-- SECTION:FINAL_SUMMARY:END -->
