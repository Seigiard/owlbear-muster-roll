---
id: TASK-114.2
title: 'Replica: commands and composers carry the block address'
status: To Do
assignee: []
created_date: '2026-11-18T18:24:00Z'
updated_date: '2026-11-18T18:25:00Z'
labels: []
dependencies:
  - TASK-114.1
parent_task_id: TASK-114
ordinal: 141000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Second PR of TASK-114. The wire commands repeat-block-add, repeat-block-delete, repeat-block-duplicate, link-set and open-sheet carry `sheetId + sectionId + instanceId + path?`; composers.ts (sectionBlocks, commandScopePath, validBlockPath, matchesBlockTarget, blockLinkTombstones with `isLegacyInstanceTarget`), proposal-queue.ts (`scopePathKey`) and pending-edits.ts (`repeatTarget`, `commandsOf`) each rebuild the address. Accepted shape: the internal `Command` type holds `block: BlockAddress` (for repeat-block-add the address of the block being created), the ui-messages schemas transform the unchanged v4 wire form into it at parse, and serialisation back to the wire form happens in one place. The owner confirmed that only their own test rooms hold v4 data older than the November 14-16 path fixes, so `isLegacyInstanceTarget` and the `instanceId` compatibility view go.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The wire JSON of every command and of `open-sheet` is byte-for-byte the v4 form: the ui-messages fixture tests pass unchanged
- [ ] #2 `Command` and `WireCommand` no longer differ; composers.ts, proposal-queue.ts and pending-edits.ts hold no path arithmetic of their own
- [ ] #3 `blockLinkTombstones` selects links by `isDescendantOf` alone and `isLegacyInstanceTarget` is gone
- [ ] #4 Replica "lock" tests that assert the old shapes are folded into the owning module tests or deleted when the type now forbids the case
- [ ] #5 Full check passes: oxfmt, lint, typecheck, bun test, test:browser, build
<!-- AC:END -->
