---
id: TASK-121.2
title: Builder preview composes through core/compose; delete src/preview; ADR-0005
status: To Do
assignee: []
created_date: '2026-11-19T07:46:00Z'
updated_date: '2026-11-19T07:46:00Z'
labels: []
dependencies:
  - TASK-121.1
parent_task_id: TASK-121
ordinal: 162000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Second PR of the composer epic (see the parent for every decision). `src/builder/preview-pane.tsx` sendCommand delegates field-patch, repeat-block-add, -delete and -duplicate to `createComposers("builder").compose` over a ComposeContext built from the snapshot records, `createVersionMinter("builder")`, core `newRecordId`, `isGmPlayer: () => true`, mode `persisted`; the preview keeps its write-policy check (`role === GM || template.players === edit`) before composing, keeps `store.setSnapshot` as the undo step, keeps `createdTabBlock` selection after an add, keeps `reconcileRecords` on preset change, and keeps answering every other command type without effect. `src/preview/` is deleted; `tests/dice-choice-field.e2e.ts` uses `src/builder/preview-records.ts`; the `@/preview/**` lint entry goes. Documents: ADR-0005, AD-23 rewritten in the spine, ADR-0003 consequence line, `deferred-work.md:559` and a note on TASK-114.3 corrected to the shared composer; one deferred-work entry for the roll result the preview never shows; references to the deleted `preview.html`/`themes.ts` in deferred-work.md marked historical.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The preview shows a duplicated repeat block after «Дублировать…» and undo removes it in one step
- [ ] #2 A unit test composes the same field-patch, add, delete and duplicate commands through the preview sendCommand and through `compose` with the same minter and ids, and the resulting records are deep-equal
- [ ] #3 `src/builder/preview-pane.tsx` contains no `c + 1`, `a: builder` or `l: [` literal; `src/preview/` does not exist; `grep -rn "@/preview" src tests .oxlintrc.json` is empty
- [ ] #4 `tests/builder-snapshot.e2e.ts` and `tests/builder.e2e.ts` pass unchanged except the sample-records consumer in `tests/dice-choice-field.e2e.ts`
- [ ] #5 ADR-0005 accepted; AD-23 rewritten; ADR-0003, deferred-work.md and TASK-114.3 corrected; the roll-display gap recorded in deferred-work.md
- [ ] #6 Full check passes: oxfmt, lint, typecheck, bun test, test:browser, build
<!-- AC:END -->
