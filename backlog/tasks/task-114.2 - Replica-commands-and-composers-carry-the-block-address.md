---
id: TASK-114.2
title: 'Replica: commands and composers carry the block address'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-18T18:24:00Z'
updated_date: '2026-11-19T02:33:00Z'
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
- [x] #1 `Command` and `WireCommand` no longer differ; composers.ts, proposal-queue.ts and pending-edits.ts hold no path arithmetic of their own
- [x] #2 `blockLinkTombstones` selects links by `isDescendantOf` alone and `isLegacyInstanceTarget` is gone
- [x] #3 Replica "lock" tests that assert the old shapes are folded into the owning module tests or deleted when the type now forbids the case
- [x] #4 Full check passes: oxfmt, lint, typecheck, bun test, test:browser, build
- [x] #5 The wire JSON of every command and of `open-sheet` is byte-for-byte the v4 form: for every wire literal in `ui-messages.test.ts` and `ui-messages-v4.test.ts`, serialise(parse(literal)) deep-equals the literal
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Run the tdd chain against _bmad-output/implementation-artifacts/spec-task-114-2-block-address-replica.md on branch task-114.2-block-address-replica, merged into the integration branch implement-specs-114.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the BlockAddress parse and wire serialization boundary. Replica composers, proposal queue, pending edits, room protocol, engine, and UI compile adapters now carry internal block addresses. Nested block link tombstones cover the block and descendants.

Verification: oxfmt, lint, typecheck, bun test (3483 pass, 1 skip), browser suite (583 pass), and build passed. Structural scans found no legacy target symbols or replica path arithmetic. Locked paths are unchanged from lock_sha.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replica commands and composers now use BlockAddress internally while preserving the v4 wire JSON. Parsing transforms wire commands and open-sheet messages into internal addresses, and the two wire serializers restore the unchanged transport shape. Legacy target matching and path reconstruction were removed, including the nested-link tombstone gap.

Verified with oxfmt, lint, typecheck, 3483 unit tests with 1 skip, 583 browser tests, and build.
<!-- SECTION:FINAL_SUMMARY:END -->
