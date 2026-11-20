---
id: TASK-130
title: Move the Builder file-access test out of src/platform
status: To Do
assignee: []
created_date: '2026-11-19T16:32:00Z'
labels: []
dependencies: []
ordinal: 171000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The 2026-11-19 architecture analysis found one import cycle between modules: builder -> ui -> platform/mock -> platform -> builder. The edge platform -> builder is a single file, `src/platform/file-access.test.ts`, which tests `createBrowserFileAccess` from `src/builder/file-access.ts` and `TestFileAccessFake` from `tests/support/file-access.ts`. No file under `src/platform` takes part in that test. The port type `FileAccessPort` stays in `src/core/file-access.ts` because AD-20 forbids the Builder from importing `src/platform`; the only adapter and its only consumer live in the Builder, so the test belongs beside the adapter. Each of the four commits to this test also changed `src/builder/`. Report: https://reports.1218217.xyz/reports/owlbear-muster-roll/20261119T162959Z-18ff8579/index.html
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The test lives at `src/builder/file-access.test.ts` with the same cases; `src/platform/file-access.test.ts` no longer exists
- [ ] #2 No file under `src/platform/` imports from `src/builder/` (madge or grep over `src/platform` shows no `builder/` edge), so the module graph has no cycle
- [ ] #3 The full local check for source paths passes: oxfmt, lint, typecheck, bun test, mutants, test:browser, build
<!-- AC:END -->
