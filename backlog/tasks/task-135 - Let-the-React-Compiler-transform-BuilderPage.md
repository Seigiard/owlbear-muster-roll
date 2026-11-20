---
id: TASK-135
title: Let the React Compiler transform BuilderPage
status: Done
assignee: []
created_date: '2026-11-20T06:19:00Z'
updated_date: '2026-11-20T07:06:00Z'
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
- [x] #1 The compiler probe reports no `CompileError` for `src/builder/builder-page.tsx`
- [x] #2 Opening, following and saving an attached preset file behave as before; `tests/builder.e2e.ts`, `tests/builder-snapshot.e2e.ts` and `src/builder/attached-files.test.ts` pass
- [x] #3 The full check from CLAUDE.md passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Full check on the branch tip 05239ad (after merging origin/master): `oxfmt --check .`, `bun run lint`, `bun run typecheck`, `bun test` (3633 pass, 0 fail, 1 skip), `bun run mutants` (55/55 killed), `bun run build` pass. `bun run test:browser`: run 1 had 586 passed and 1 failed (`tests/room-copy.e2e.ts:73`, not in this change, 15/15 in isolation); run 2 was void (the Vite dev server died on a V8 abort); run 3 passed 587/587.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
React Compiler 1.0 skipped `BuilderPage` because it read `followAttachedFile`, `writeFile` and `documentText` above their declarations; after those, it also rejects a hoisted function calling another declared later. The function declarations now come before their first use. Nothing else changed: the sorted lines of the file and the order of hook calls are identical. Probe: nothing for `src/builder/builder-page.tsx` (was `builder-page.tsx:109 Cannot access variable before it is declared` x3). `src/builder/attached-files.test.ts` 33/33; `tests/builder.e2e.ts` and `tests/builder-snapshot.e2e.ts` 56/56. Full check passes (see notes). Review found four older attached-file write races in the moved code (one verified); all are in `deferred-work.md`. Commit 5f09625.
<!-- SECTION:FINAL_SUMMARY:END -->
