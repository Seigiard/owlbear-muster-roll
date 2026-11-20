---
id: TASK-135
title: Let the React Compiler transform BuilderPage
status: To Do
assignee: []
created_date: '2026-11-20T06:19:00Z'
labels: []
dependencies: []
priority: low
type: task
ordinal: 174000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-113 turned on the React Compiler for the Vite build. A component the compiler cannot transform is left as written: it still works, but gets no automatic memoization and re-renders in full on every parent render. TASK-113 recorded the remaining bailouts in `_bmad-output/implementation-artifacts/deferred-work.md` (section "Deferred from: TASK-113").

`BuilderPage` (`src/builder/builder-page.tsx`) bails out with "Cannot access variable before it is declared" (three times): it reads `followAttachedFile`, `writeFile` and `documentText` above their declarations.

Reproduce with the compiler probe: run `babel-plugin-react-compiler` 1.0.0 through `@babel/core` 7 (`transformFileAsync`) over the file with `parserOpts: { plugins: ['typescript', 'jsx'] }` and a `logger.logEvent` that prints each event of kind `CompileError` with `fnLoc.start.line` and `detail.reason`. The build itself does not report bailouts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The compiler probe reports no `CompileError` for `src/builder/builder-page.tsx`
- [ ] #2 Opening, following and saving an attached preset file behave as before; `tests/builder.e2e.ts`, `tests/builder-snapshot.e2e.ts` and `src/builder/attached-files.test.ts` pass
- [ ] #3 The full check from CLAUDE.md passes
<!-- AC:END -->
