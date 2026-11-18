---
id: TASK-114.1
title: 'Core: block-address module, ADR-0003 and core consumers'
status: To Do
assignee: []
created_date: '2026-11-18T18:24:00Z'
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
- [ ] #1 A `block-address.test.ts` covers key round trip for root, one-level and nested blocks, parent, scopePath, isDescendantOf and the rejection of odd-length and empty-segment paths
- [ ] #2 preset.ts exposes repeat scope and section lookups by scope path only; `repeatScopeById` and `repeatSectionById` no longer exist
- [ ] #3 records.ts, field-patch.ts, link-target.ts, token-links.ts, visibility.ts, dice-roll.ts, sheets.ts and the snapshot modules hold no `path.at(-2)`, `slice(0, -2)`, `length % 2` or even-index filter of their own
- [ ] #4 GLOSSARY.md defines Block address and docs/adr/0003 is accepted
- [ ] #5 Core "lock" tests (`*-v4.test.ts`, `repeat-row-review-fix.test.ts`) that assert the old shapes are folded into the owning module tests or deleted when the type now forbids the case
- [ ] #6 Full check passes: oxfmt, lint, typecheck, bun test, test:browser, build
<!-- AC:END -->
