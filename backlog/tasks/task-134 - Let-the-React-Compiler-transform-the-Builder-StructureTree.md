---
id: TASK-134
title: Let the React Compiler transform the Builder StructureTree
status: To Do
assignee: []
created_date: '2026-11-20T06:18:00Z'
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
- [ ] #1 The compiler probe reports no `CompileError` for `src/builder/structure-tree.tsx`
- [ ] #2 Dragging an item in the Builder structure tree carries the same drag types and values as before; `tests/builder.e2e.ts` passes
- [ ] #3 The full check from CLAUDE.md passes
<!-- AC:END -->
