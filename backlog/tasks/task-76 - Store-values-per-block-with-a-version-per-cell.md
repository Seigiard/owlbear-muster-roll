---
id: TASK-76
title: Store values per block with a version per cell
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-16T06:49:00Z'
updated_date: '2026-11-16T15:17:00Z'
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
1. Approved _bmad-output/implementation-artifacts/spec-task-76-block-records.md.
2. Implemented preset v3/data v4 block records, per-cell merge, null clears and lifecycle-safe deletion.
3. Ported storage, snapshots, replica, UI, Builder and test fixtures.
4. Completed unit/browser and static checks; recorded unchanged d20 workload at 11434 bytes, margin 4066.
5. Broad mutation sweep cancelled per the user instruction; no additional sweeps or controls. Reuse existing green checks and run only finding-specific tests.
6. Complete parent diff/matrix audit and focused bmad-build review; record final evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Format v4 implementation is complete in the working tree. Presets remain v3; data, wire, snapshots, room copies and browser storage use v4 block records and mr4 keys. Blocks carry per-cell versions plus an independent lifecycle. Changed-cell commits, fragment assembly, proposal ACK identity, preset relocation, manual snapshots, Builder, UI projection and browser fixtures are ported.

Coverage includes concurrent edits to different root and repeat cells, deterministic same-cell winners, versioned clears, deletion versus late higher-counter edits, relocation A to B to A, proposal resend/stale/ACK behavior, duplicate snapshot paths and instance IDs, digest/read-back coverage, bounded cell fragmentation and old snapshot rejection.

Verified before mutation calibration: Playwright 541/541; unit suite 3350 passed, 1 skipped, 0 failed; format, lint, typecheck, build, git diff --check and backlog doctor pass. The unchanged d20 workload is 11434 bytes with a 4066-byte margin. Mutation probes and controls remain before Done.

User rejected broad verification. The core mutation sweep at 156c4dba4110b942cd905eba3f6be75f631e46a1 was cancelled with exit 130 after 35m29.722s: 800 killed, 103 survived, 3 timed out from 1319 inventoried; baseline comparison not reached. This is CANCELLED/INCOMPLETE, not a passing comparison. All six temporary probe worktrees and their pool were cleaned; no live probe process remains. Additional sweeps and controls were not run. Parent review remains before Done.

Parent completed matrix audit and three-lens code review. Per owner instruction, no further fixes or broad checks were added: review findings are tracked in TASK-81 (large fragmented edits/assembly/projection budgets), TASK-82 (concurrent or interrupted preset reconciliation; high-priority potential lost edit), TASK-83 (pending display), TASK-84 (repeated root serialization), TASK-85 (record-boundary and fixture-version edge cases). These include current-change defects and remain unresolved; this is not a defect-free review verdict.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Values now use blk: records with per-cell versions, null clears and delete-safe lifecycles; presets remain v3, data/snapshots use v4 without a converter. Storage, snapshots, replica, UI and Builder are ported. Verified 3350 unit pass / 1 skip / 0 fail, 541 browser pass, format/lint/typecheck/build and Backlog checks; d20 copy 11434 bytes, margin 4066. Implementation commit 156c4dba4110b942cd905eba3f6be75f631e46a1. Broad mutation probe cancelled/incomplete, not passed. Owner-directed review follow-ups TASK-81 through TASK-85 remain; no push or deployment.
<!-- SECTION:FINAL_SUMMARY:END -->
