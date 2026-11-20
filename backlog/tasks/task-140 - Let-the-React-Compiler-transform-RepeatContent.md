---
id: TASK-140
title: Let the React Compiler transform RepeatContent
status: Done
assignee:
  - '@seigiard'
created_date: '2026-11-20T06:44:00Z'
updated_date: '2026-11-20T15:07:00Z'
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
- [x] #1 The compiler probe (Babel 7.29 with `babel-plugin-react-compiler` 1.0 and a logger printing `CompileError` events) reports nothing for `src/ui/sheet/preset-section.tsx`
- [x] #2 Focus after adding, deleting and duplicating a repeat block is unchanged: opening the duplicate form focuses its count field and Escape returns focus to the invoking button; `tests/repeat-blocks.e2e.ts` and `tests/nested-repeat.e2e.ts` pass
- [x] #3 No profiling code ships
- [x] #4 The full check from CLAUDE.md passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the two React Compiler diagnostics with the TASK-136 Babel probe.
2. Pass the existing add-button ref by local binding only.
3. Confirm CompileSuccess, run the repeat and duplicate browser suites, and run the full check from CLAUDE.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Babel 7.29.0 with React Compiler 1.0.0: the baseline emitted two `Cannot access refs during render` errors. The patched file emitted `CompileSuccess RepeatContent 39` and zero `CompileError` events. The only production edit is the local binding of the existing `addButton` ref.
- Focus evidence: `repeat-blocks.e2e.ts`, `nested-repeat.e2e.ts`, and `duplicate.e2e.ts` passed 45 tests before integration. The full run on `0be8b4aa00b76f0cba7c9310f6377a19467b5cf9`, with `bun run test:browser --workers=1`, passed all 589 tests.
- Earlier full runs: the first reached the 120-second runner limit; access and builder-snapshot passed alone (16 and 25). A complete two-worker run passed 587 of 588; the preset-copy download in `builder.e2e.ts:415` timed out, then the file passed 31 of 31 alone. The first one-worker run passed 588 of 589; the no-preset catch-up case in `catch-up.e2e.ts:124` timed out, then the file passed 8 of 8 alone. TASK-142 tracks browser load flakes. No new load-flake task was filed.
- All remaining checks passed on `0be8b4aa00b76f0cba7c9310f6377a19467b5cf9`: format, lint, typecheck, unit tests (3,680 pass, 1 skip), mutants (55 killed, none survived), build and formal drift. Two independent review sources confirmed the final review round with no findings.
- Existing add focus skips a leading select field in the mock browser. Deferred to TASK-151; no focus logic changed here.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
React Compiler now transforms `RepeatContent` without changing keyboard focus. Babel reported no errors, all 589 browser tests passed, and the other checks in CLAUDE.md passed. No profiling code or tests changed. The existing leading-select focus issue remains in TASK-151.
<!-- SECTION:FINAL_SUMMARY:END -->
