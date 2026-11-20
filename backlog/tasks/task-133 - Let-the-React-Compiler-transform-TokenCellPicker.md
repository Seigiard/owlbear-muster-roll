---
id: TASK-133
title: Let the React Compiler transform TokenCellPicker
status: Done
assignee: []
created_date: '2026-11-20T06:18:00Z'
updated_date: '2026-11-20T07:06:00Z'
labels: []
dependencies: []
priority: low
type: task
ordinal: 172000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-113 turned on the React Compiler for the Vite build. A component the compiler cannot transform is left as written: it still works, but gets no automatic memoization and re-renders in full on every parent render. TASK-113 recorded the remaining bailouts in `_bmad-output/implementation-artifacts/deferred-work.md` (section "Deferred from: TASK-113").

`TokenCellPicker` (`src/ui/picker/link-picker.tsx`) bails out with "(BuildHIR::lowerStatement) Handle TryStatement with a finalizer ('finally') clause": `apply` releases its busy state in a `finally` after the async link commands. Compiler 1.0 cannot lower `try/finally`.

Reproduce with the compiler probe: run `babel-plugin-react-compiler` 1.0.0 through `@babel/core` 7 (`transformFileAsync`) over the file with `parserOpts: { plugins: ['typescript', 'jsx'] }` and a `logger.logEvent` that prints each event of kind `CompileError` with `fnLoc.start.line` and `detail.reason`. The build itself does not report bailouts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The compiler probe reports no `CompileError` for `src/ui/picker/link-picker.tsx`
- [x] #2 A link apply still clears the busy state after success, after a command that is not answered, and after an `onLinked` failure, and shows the failure in the last two cases; `src/ui/picker/link-picker.test.tsx` and `tests/link.e2e.ts` pass
- [x] #3 The full check from CLAUDE.md passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Full check on the branch tip 05239ad (after merging origin/master): `oxfmt --check .`, `bun run lint`, `bun run typecheck`, `bun test` (3633 pass, 0 fail, 1 skip), `bun run mutants` (55/55 killed), `bun run build` pass. `bun run test:browser`: run 1 had 586 passed and 1 failed (`tests/room-copy.e2e.ts:73`, not in this change, 15/15 in isolation); run 2 was void (the Vite dev server died on a V8 abort); run 3 passed 587/587.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
React Compiler 1.0 skipped `TokenCellPicker` because `apply` used `try/finally`. `apply` now has one `try/catch` and calls `setBusy(false)` after it; the catch swallows every failure, so busy clears on every path `finally` covered. Probe: nothing for `src/ui/picker/link-picker.tsx` (was `link-picker.tsx:451 Handle TryStatement with a finalizer`). Tests: `link-picker.test.tsx` 34/34, with new assertions that the link button is enabled again after a refused batch and a timed-out command, and a new test for a failed `onLinked`; with `setBusy(false)` removed, 4 tests fail. `tests/link.e2e.ts` 17/17. Full check passes (see notes). Commit 8d9c9cf.
<!-- SECTION:FINAL_SUMMARY:END -->
