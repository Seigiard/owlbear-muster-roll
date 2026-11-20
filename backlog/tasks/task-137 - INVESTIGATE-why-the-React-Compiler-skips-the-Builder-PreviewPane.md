---
id: TASK-137
title: 'INVESTIGATE: why the React Compiler skips the Builder PreviewPane'
status: To Do
assignee: []
created_date: '2026-11-20T06:19:00Z'
labels: []
dependencies: []
priority: low
type: spike
ordinal: 176000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-113 turned on the React Compiler for the Vite build. A component the compiler cannot transform is left as written: it still works, but gets no automatic memoization and re-renders in full on every parent render. TASK-113 recorded the remaining bailouts in `_bmad-output/implementation-artifacts/deferred-work.md` (section "Deferred from: TASK-113").

`PreviewPane` (`src/builder/preview-pane.tsx`) bails out three times with "Existing memoization could not be preserved": the compiler finds that a dependency of a hand-written `useMemo` may change later. The pane has eight `useMemo` calls. Some only cache derived values (`toPreset`, `encodePreset`, `template`); others create stateful objects that must keep one identity for the life of the pane (`createVersionMinter`, `createLocalFieldValues`, `createFieldFlushes`). It is unknown which ones trigger the bailout, and whether the stateful ones belong in `useState`/`useRef` initializers rather than `useMemo`.

Reproduce with the compiler probe: run `babel-plugin-react-compiler` 1.0.0 through `@babel/core` 7 (`transformFileAsync`) over the file with `parserOpts: { plugins: ['typescript', 'jsx'] }` and a `logger.logEvent` that prints each event of kind `CompileError` with `fnLoc.start.line` and `detail.reason`. The build itself does not report bailouts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The task notes name the `useMemo` calls and the dependencies behind each "Existing memoization could not be preserved" report, with the probe output that shows it
- [ ] #2 The task notes say, for each `useMemo` in `PreviewPane`, whether it only caches a value or must keep an identity, and which change (remove it, or move it to a `useState`/`useRef` initializer) removes the bailout without changing the preview
- [ ] #3 The task notes give a do or drop recommendation; a follow-up task exists for the fix when the recommendation is to do it; no production code changes in this task
<!-- AC:END -->
