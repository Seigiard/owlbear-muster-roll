---
id: TASK-76
title: Store values per block with a version per cell
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-11-16T06:49:00Z'
updated_date: '2026-11-16T14:20:00Z'
labels:
  - format-v4
dependencies: []
references:
  - _bmad-output/specs/spec-muster-roll/storage-and-sync.md
  - _bmad-output/specs/spec-muster-roll/stories.yaml
  - tools/mutants/probe-baseline.json
  - _bmad-output/implementation-artifacts/spec-task-76-block-records.md
type: feature
ordinal: 103000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Values live in `row:<sheet>:<first field id>` and `rep:<sheet>:<first field id>:<block>` records: their identity is positional, so moving a field renames the record, and two people editing different fields of one row lose one edit. Format v4 (forge/uniform-preset-tree) replaces both with one `blk:` record per block, the sheet root included, and a version per cell, so concurrent edits of different fields never collide and a block path can nest later. Story 8 of _bmad-output/specs/spec-muster-roll/stories.yaml (spec and done checkpoints); CAP-9, CAP-11, CAP-13. The preset stays v3 in this task: a repeat section block still uses the first field id as its scope id. Measured on a synthetic room: 7436 B against 4644 B today, limit 15500. The replica modules this touches (catch-up, room-copy, engine, command-routing) carry the TASK-75 mutation probe baseline in tools/mutants/probe-baseline.json; run the probe again after the change.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every value record is `blk:<sheet>[:<scopeId>:<blockId>]*` holding `order`, the set for a sheet of a set, and `cells` where each cell carries its own version (value, counter, author); no `row:` or `rep:` record remains
- [x] #2 Merge is per cell: two GM tabs editing different fields of one sheet both keep their edit, two edits of one cell settle on the latest version on all clients (CAP-11), and a null block record deletes the block and wins over its cells
- [x] #3 Snapshot export, import, catch-up, room copy and every command use the new records; a snapshot with `row:` or `rep:` records is refused as older-version
- [x] #4 The room copy for tests/fixtures/presets/d20.json is measured with src/core/snapshot-size.test.ts and recorded in _bmad-output/specs/spec-muster-roll/storage-and-sync.md
- [x] #5 Unit and e2e tests cover the per-cell merge and the block delete
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Approve _bmad-output/implementation-artifacts/spec-task-76-block-records.md (story 8 spec checkpoint).
2. Separate preset v3 from data/wire/snapshot v4; implement block roots, cell versions, clear markers and delete-safe lifecycle.
3. Update readers, access, migration, codecs, bounded transport, replica queues/persistence, UI and Builder consumers.
4. Calibrate merge/delete regressions, port fixtures and verify snapshot/Builder/catch-up/room-copy paths.
5. Measure the unchanged d20 workload and record bytes and the existing margin. Run full checks and touched replica mutation probes on committed changes.
6. Complete the bmad-build review and record acceptance evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Format v4 implementation is complete in the working tree. Presets remain v3; data, wire, snapshots, room copies and browser storage use v4 block records and mr4 keys. Blocks carry per-cell versions plus an independent lifecycle. Changed-cell commits, fragment assembly, proposal ACK identity, preset relocation, manual snapshots, Builder, UI projection and browser fixtures are ported.

Coverage includes concurrent edits to different root and repeat cells, deterministic same-cell winners, versioned clears, deletion versus late higher-counter edits, relocation A to B to A, proposal resend/stale/ACK behavior, duplicate snapshot paths and instance IDs, digest/read-back coverage, bounded cell fragmentation and old snapshot rejection.

Verified before mutation calibration: Playwright 541/541; unit suite 3350 passed, 1 skipped, 0 failed; format, lint, typecheck, build, git diff --check and backlog doctor pass. The unchanged d20 workload is 11434 bytes with a 4066-byte margin. Mutation probes and controls remain before Done.
<!-- SECTION:NOTES:END -->
