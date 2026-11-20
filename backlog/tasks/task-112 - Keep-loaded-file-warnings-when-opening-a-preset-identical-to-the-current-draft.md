---
id: TASK-112
title: Keep loaded-file warnings when opening a preset identical to the current draft
status: Done
assignee:
  - '@claude'
created_date: '2026-11-18T09:59:00Z'
updated_date: '2026-11-20T06:46:00Z'
labels:
  - format-v4
  - review-follow-up
  - optional-follow-up
dependencies: []
references:
  - TASK-80
  - src/builder/builder-page.tsx:159-165
  - src/builder/builder-store.ts
priority: low
type: bug
ordinal: 138000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-80 confirming review05 found a narrow loaded-warning gap. Build an origin-less draft or open an example, save its preset, then open that identical file. BuilderPage.open attaches the file but skips store.open because samePreset is true, leaving origin null and no original repeat identity. A subsequent repeat id change or repeat removal has no early Builder warning. Runtime upload still confirms destructive changes, so this is a minor follow-up and does not block the bounded preset-v4 completion. Source-confirmed at6695d234; finding bugs+impl-1, severity minor/refined.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Opening the same preset file as an origin-less draft establishes loaded-file warning identity.
- [x] #2 A later repeat id change or removal warns about the correct original room block.
- [x] #3 Attaching an identical preset preserves the current snapshot records and edited values.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. On an identical open, BuilderPage.open calls a new store.adoptOrigin(next.origin) instead of skipping the store. 2. adoptOrigin sets origin and collects originRepeatIds on the current document uids, for an origin-less draft only, without an undo step; history steps get the origin too. 3. Page test (id change, repeat off, records kept) and store tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Spec: _bmad-output/implementation-artifacts/spec-task-112-identical-preset-origin.md (oneshot, Blind Hunter review triaged there). Decision: a draft that already has an origin keeps it, because the attached file is written on each edit and reopening it must not drop the warnings about the first loaded file. Checks on 513f717: oxfmt, lint, typecheck, bun test (3638 pass), mutants 55/55 killed, build, builder e2e 56/56. Full test:browser: 586 pass, 1 fail in tests/selection.e2e.ts:135 (no Builder), 3/3 green alone; deferred as TASK-139.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Opening a preset file identical to an origin-less draft now makes that file the draft's origin. Before, BuilderPage.open skipped store.open to keep snapshot records, so a later repeat id change or repeat removal showed no 'blocks will be erased' warning. New BuilderStore.adoptOrigin sets the origin and the original repeat ids on the current document uids, keeps document, selection and records, and updates undo/redo steps so the identity survives undo. A draft that already has an origin keeps it. Evidence: attached-files.test.ts (warning names 'attacks' after id change and repeat off, records kept by identity, preview value kept), builder-store.test.ts (ids match a normal loaded open, persist across reload, survive undo/redo/branch, differing preset and existing origin ignored). Follow-up: TASK-139 (unrelated selection e2e flake).
<!-- SECTION:FINAL_SUMMARY:END -->
