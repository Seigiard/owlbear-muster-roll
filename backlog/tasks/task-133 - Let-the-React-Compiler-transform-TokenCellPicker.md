---
id: TASK-133
title: Let the React Compiler transform TokenCellPicker
status: To Do
assignee: []
created_date: '2026-11-20T06:18:00Z'
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
- [ ] #1 The compiler probe reports no `CompileError` for `src/ui/picker/link-picker.tsx`
- [ ] #2 A link apply still clears the busy state after success, after a command that is not answered, and after an `onLinked` failure, and shows the failure in the last two cases; `src/ui/picker/link-picker.test.tsx` and `tests/link.e2e.ts` pass
- [ ] #3 The full check from CLAUDE.md passes
<!-- AC:END -->
