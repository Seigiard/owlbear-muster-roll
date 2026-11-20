---
id: TASK-136
title: 'INVESTIGATE: why the React Compiler skips RepeatContent'
status: To Do
assignee: []
created_date: '2026-11-20T06:19:00Z'
labels: []
dependencies: []
priority: low
type: spike
ordinal: 175000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-113 turned on the React Compiler for the Vite build. A component the compiler cannot transform is left as written: it still works, but gets no automatic memoization and re-renders in full on every parent render. TASK-113 recorded the remaining bailouts in `_bmad-output/implementation-artifacts/deferred-work.md` (section "Deferred from: TASK-113").

`RepeatContent` (`src/ui/sheet/preset-section.tsx`) is the repeat section of a sheet: its repeat blocks with "Удалить" and "Добавить" under them. It bails out twice with "Cannot access refs during render", and the probe does not name the expression. Candidates are the focus refs of `useRepeatBlocks` (`src/ui/sheet/use-repeat-blocks.ts`: `addButton`, `blockElements`, `deleteButtons`) and the `duplicateButtons` map in `preset-section.tsx`. They move the focus after a block is added, deleted or duplicated, which `tests/repeat-blocks.e2e.ts` and `tests/nested-repeat.e2e.ts` cover. The fix is unknown, and so is whether the missed memoization costs anything on a real sheet.

Reproduce with the compiler probe: run `babel-plugin-react-compiler` 1.0.0 through `@babel/core` 7 (`transformFileAsync`) over the file with `parserOpts: { plugins: ['typescript', 'jsx'] }` and a `logger.logEvent` that prints each event of kind `CompileError` with `fnLoc.start.line` and `detail.reason`. The build itself does not report bailouts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The task notes name each expression that makes the compiler report "Cannot access refs during render" for `RepeatContent`, with the probe output that shows it
- [ ] #2 The task notes state whether a change can remove the bailout while keeping the focus behavior that `tests/repeat-blocks.e2e.ts` and `tests/nested-repeat.e2e.ts` check, and sketch that change
- [ ] #3 The task notes give the re-render cost of the bailout on a sheet with many repeat blocks (for example React Profiler commit times with and without the fix), and a do or drop recommendation
- [ ] #4 A follow-up task exists for the fix when the recommendation is to do it; no production code changes in this task
<!-- AC:END -->
