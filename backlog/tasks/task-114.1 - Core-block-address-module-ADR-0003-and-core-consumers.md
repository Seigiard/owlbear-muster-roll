---
id: TASK-114.1
title: 'Core: block-address module, ADR-0003 and core consumers'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-18T18:24:00Z'
updated_date: '2026-11-18T22:12:00Z'
labels: []
dependencies: []
parent_task_id: TASK-114
ordinal: 140000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
First PR of TASK-114. Core holds the three key forms (`blockKey`, `repKey`, `blockPathKey` in records.ts), the `{sectionId, instanceId, path?}` triple in field-patch.ts, `LinkTarget` with its compatibility `instanceId` in link-target.ts, the `DicePlace` triple in dice-roll.ts, and `*ById` plus `*ByPath` lookup pairs in preset.ts; each consumer (field-patch, link-target, token-links, visibility, dice-roll, sheets, snapshot-file, snapshot-import, preset-migrate) does its own path arithmetic. Accepted shape: `src/core/block-address.ts` exports a plain readonly `{ sheetId, path }` built only through constructor functions, with key/parse, parent, scopePath, sectionId, instanceId, isDescendantOf and equals, plus the zod transforms that turn the v4 `blk:` key, `link:` data (`s` + optional `path`) and the wire triple into an address and back. `FieldPatchTarget` becomes `{kind: row, rowId} | {kind: rep, block}`; `LinkTarget` becomes `{block, cellId?}` where an empty path names the sheet; `fieldPatchTargetSchema` and `fieldPatchTargetWireSchema` merge into one schema with a transform. The replica and ui keep compiling against the old shapes through adapters that the later subtasks remove.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A `block-address.test.ts` covers key round trip for root, one-level and nested blocks, parent, scopePath, isDescendantOf and the rejection of odd-length and empty-segment paths
- [x] #2 records.ts, field-patch.ts, link-target.ts, token-links.ts, visibility.ts, dice-roll.ts, sheets.ts and the snapshot modules hold no `path.at(-2)`, `slice(0, -2)`, `length % 2` or even-index filter of their own
- [x] #3 GLOSSARY.md defines Block address and docs/adr/0003 is accepted
- [x] #4 Core "lock" tests (`*-v4.test.ts`, `repeat-row-review-fix.test.ts`) that assert the old shapes are folded into the owning module tests or deleted when the type now forbids the case
- [x] #5 Full check passes: oxfmt, lint, typecheck, bun test, test:browser, build
- [x] #6 preset.ts exposes repeat scope, section and section-place lookups by scope path only; `repeatScopeById` and `repeatSectionById` no longer exist (`repeatTabById` stays: tabs exist only at depth 0; the private formula fallback in `scopeFieldsAt` stays under TASK-108)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Run the tdd chain against _bmad-output/implementation-artifacts/spec-task-114-1-block-address-core.md on branch task-114.1-block-address-core, merged into the integration branch implement-specs-114.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented BlockAddress as the single core representation and kept v4 storage and wire bytes unchanged. Migrated core consumers and added compatibility adapters at replica, UI and Builder edges. Fixed repeat-tab token targets and nested Builder block-prefix handling without changing locked tests.

Verification: bunx oxfmt --ignore-path .gitignore --check .; bun run lint (existing warnings only); bun run typecheck; bun test (3480 passed, 1 skipped); bun run test:browser (583 passed); bun run build. Locked paths are byte-identical to lock SHA 7ccaf0f.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
BlockAddress now owns block identity across core consumers. Root, shallow and nested blocks resolve through one address while v4 storage and wire formats remain unchanged. Repeat-tab and Builder browser behavior is preserved, including nested token links and add-only previews. All six acceptance criteria are verified. Full checks pass: formatting, lint, typecheck, 3480 unit tests with 1 skipped, 583 browser tests, and build.
<!-- SECTION:FINAL_SUMMARY:END -->
