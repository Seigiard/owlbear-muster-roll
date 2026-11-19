---
id: TASK-121.2
title: Builder preview composes through core/compose; delete src/preview; ADR-0005
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T07:46:00Z'
updated_date: '2026-11-19T08:22:00Z'
labels: []
dependencies:
  - TASK-121.1
parent_task_id: TASK-121
ordinal: 162000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Second PR of the composer epic (see the parent for every decision). `src/builder/preview-pane.tsx` sendCommand delegates field-patch, repeat-block-add and repeat-block-delete to `createComposers("builder").compose` over a ComposeContext built from the rendered records plus a synthetic `preset` record, `createVersionMinter("builder")`, core `newRecordId`, `isGmPlayer: () => true`, mode `persisted`; the preview keeps its write-policy check (`role === GM || template.players === edit`) before composing, keeps `store.setSnapshot` as the undo step, keeps `createdTabBlock` selection after an add, keeps `reconcileRecords` on preset change, keeps `blockTools: null` (no «Дублировать…», correction of 2026-11-19), and keeps answering every other command type without effect. `src/preview/` is deleted with its only consumer, the first test in `tests/dice-choice-field.e2e.ts`; the `@/preview/**` lint entry goes. Documents: ADR-0005, AD-23, ADR-0003, deferred-work.md and TASK-114.3 landed on the epic branch before this PR; this PR adds nothing to them unless the implementation finds them wrong.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `src/builder/preview-pane.tsx` contains no `c + 1`, `a: builder` or `l: [` literal; `src/preview/` does not exist; `grep -rn "@/preview" src tests .oxlintrc.json` is empty
- [ ] #2 Full check passes: oxfmt, lint, typecheck, bun test, test:browser, build
- [ ] #3 `src/builder/preview-compose.test.ts` asserts literal expected records for field-patch, repeat-block-add and repeat-block-delete composed for the preview (other cells survive, counters minted by the composer, tombstone keeps `l` and tombstones the link, add orders by live siblings, refusal returns the same array); no parity test against `compose`
- [ ] #4 Every existing test in `tests/builder-snapshot.e2e.ts` and `tests/builder.e2e.ts` passes unchanged, and one new test shows the preview read-only while the draft has a problem
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Spec: _bmad-output/implementation-artifacts/spec-task-121-2-preview-composes.md (ready-for-dev)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ACs 3 and 4 reworded on 2026-11-19 to match the owner-approved frozen spec (spec-task-121-2-preview-composes.md): the spec forbids a parity test against compose (a tautology) and adds one read-only test to builder-snapshot.e2e.ts. Run by Claude Code via implement-spec + tdd (OpenCode children).
<!-- SECTION:NOTES:END -->
