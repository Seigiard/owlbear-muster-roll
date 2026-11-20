---
id: TASK-140
title: Let the React Compiler transform RepeatContent
status: To Do
assignee: []
created_date: '2026-11-20T06:44:00Z'
labels: []
dependencies: []
priority: low
type: task
ordinal: 177000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
React Compiler 1.0 skips `RepeatContent` (`src/ui/sheet/preset-section.tsx`), the repeat section of a sheet, with "Cannot access refs during render". Once the add-button ref is passed as `ref={controls.addButton}`, the compiler treats the whole `controls` object from `useRepeatBlocks` as a ref holder, so `controls.addButton` and `controls.add` both count as ref reads during render. The TASK-136 spike measured the cost on a sheet with 120 nested repeat blocks: opening or closing a block's duplicate form costs about 13 ms of React render work that the compiled component skips (about 1 ms), and keydown-to-frame falls from about 31-35 ms to about 12 ms. TASK-136 notes hold the probe evidence, a two-line throwaway fix that passed both repeat e2e suites, and the profiler numbers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The compiler probe (Babel 7.29 with `babel-plugin-react-compiler` 1.0 and a logger printing `CompileError` events) reports nothing for `src/ui/sheet/preset-section.tsx`
- [ ] #2 Focus after adding, deleting and duplicating a repeat block is unchanged: opening the duplicate form focuses its count field and Escape returns focus to the invoking button; `tests/repeat-blocks.e2e.ts` and `tests/nested-repeat.e2e.ts` pass
- [ ] #3 No profiling code ships
- [ ] #4 The full check from CLAUDE.md passes
<!-- AC:END -->
