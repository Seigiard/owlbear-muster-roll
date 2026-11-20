---
id: TASK-141
title: Let the React Compiler transform the Builder PreviewPane
status: To Do
assignee: []
created_date: '2026-11-20T06:44:00Z'
labels: []
dependencies: []
priority: low
type: task
ordinal: 178000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
React Compiler 1.0 skips the Builder `PreviewPane` (`src/builder/preview-pane.tsx`) with "Existing memoization could not be preserved" three times. All three hand-written memos (`renderRecords`, `visibleRenderedTabs`, `visibleRepeatTabs`) depend on `renderSheetId`, a `string | null` the compiler reports as "may be modified later". The pane also creates three stateful objects in `useMemo` with empty deps (`createVersionMinter`, `createLocalFieldValues`, `createFieldFlushes`) that must keep one identity for the life of the pane. The TASK-137 spike found a one-file throwaway change that compiled the pane, kept every derived cache and passed the Builder unit tests and three Chromium suites; it measured no speedup, so this is low priority. TASK-137 notes hold the probe evidence and a table of all 21 `useMemo` calls.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The compiler probe (Babel 7.29 with `babel-plugin-react-compiler` 1.0 and a logger printing `CompileError` events) reports nothing for `src/builder/preview-pane.tsx`, and the record and tab caches survive in the compiled output
- [ ] #2 Replacing the preset does not remount the pane or reset the version minter, the local field values or the page-hide flushes; editing and rolling still use current inputs
- [ ] #3 Builder unit tests, `tests/builder.e2e.ts`, `tests/builder-snapshot.e2e.ts` and `tests/repeat-tabs.e2e.ts` pass, including preset replacement, page-hide saves, and repeat-tab add and selection
- [ ] #4 The full check from CLAUDE.md passes
<!-- AC:END -->
