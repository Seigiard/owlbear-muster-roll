---
id: TASK-134
title: Let the React Compiler transform the Builder StructureTree
status: Done
assignee: []
created_date: '2026-11-20T06:18:00Z'
updated_date: '2026-11-20T07:06:00Z'
labels: []
dependencies: []
priority: low
type: task
ordinal: 173000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-113 turned on the React Compiler for the Vite build. A component the compiler cannot transform is left as written: it still works, but gets no automatic memoization and re-renders in full on every parent render. TASK-113 recorded the remaining bailouts in `_bmad-output/implementation-artifacts/deferred-work.md` (section "Deferred from: TASK-113").

`StructureTree` (`src/builder/structure-tree.tsx`) bails out with "(BuildHIR::lowerExpression) Expected Identifier, got CallExpression key in ObjectExpression": the drag items are built as `{ [dragTypeOf(current, String(key))]: String(key) }`. Compiler 1.0 cannot lower a computed object key that is a call.

Reproduce with the compiler probe: run `babel-plugin-react-compiler` 1.0.0 through `@babel/core` 7 (`transformFileAsync`) over the file with `parserOpts: { plugins: ['typescript', 'jsx'] }` and a `logger.logEvent` that prints each event of kind `CompileError` with `fnLoc.start.line` and `detail.reason`. The build itself does not report bailouts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The compiler probe reports no `CompileError` for `src/builder/structure-tree.tsx`
- [x] #2 Dragging an item in the Builder structure tree carries the same drag types and values as before; `tests/builder.e2e.ts` passes
- [x] #3 The full check from CLAUDE.md passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Full check on the branch tip 05239ad (after merging origin/master): `oxfmt --check .`, `bun run lint`, `bun run typecheck`, `bun test` (3633 pass, 0 fail, 1 skip), `bun run mutants` (55/55 killed), `bun run build` pass. `bun run test:browser`: run 1 had 586 passed and 1 failed (`tests/room-copy.e2e.ts:73`, not in this change, 15/15 in isolation); run 2 was void (the Vite dev server died on a V8 abort); run 3 passed 587/587.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
React Compiler 1.0 skipped `StructureTree` because `getItems` used a call as a computed object key. The drag type now goes into a local first: `const type = dragTypeOf(current, id); return { [type]: id }`, so each drag item keeps the same type and value. Probe: nothing for `src/builder/structure-tree.tsx` (was `structure-tree.tsx:80 Expected Identifier, got CallExpression key`). `tests/builder.e2e.ts` 31/31; with a wrong drag type, both drag tests fail. Full check passes (see notes). A repository check that would catch a returning bailout is recorded in `deferred-work.md`. Commit e58aa27.
<!-- SECTION:FINAL_SUMMARY:END -->
