---
id: TASK-76
title: Store values per block with a version per cell
status: To Do
assignee: []
created_date: '2026-11-16T06:49:00Z'
updated_date: '2026-11-16T10:07:00Z'
labels:
  - format-v4
dependencies: []
references:
  - _bmad-output/specs/spec-muster-roll/storage-and-sync.md
  - _bmad-output/specs/spec-muster-roll/stories.yaml
  - tools/mutants/probe-baseline.json
type: feature
ordinal: 103000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Values live in `row:<sheet>:<first field id>` and `rep:<sheet>:<first field id>:<block>` records: their identity is positional, so moving a field renames the record, and two people editing different fields of one row lose one edit. Format v4 (forge/uniform-preset-tree) replaces both with one `blk:` record per block, the sheet root included, and a version per cell, so concurrent edits of different fields never collide and a block path can nest later. Story 8 of _bmad-output/specs/spec-muster-roll/stories.yaml (spec and done checkpoints); CAP-9, CAP-11, CAP-13. The preset stays v3 in this task: a repeat section block still uses the first field id as its scope id. Measured on a synthetic room: 7436 B against 4644 B today, limit 15500. The replica modules this touches (catch-up, room-copy, engine, command-routing) carry the TASK-75 mutation probe baseline in tools/mutants/probe-baseline.json; run the probe again after the change.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every value record is `blk:<sheet>[:<scopeId>:<blockId>]*` holding `order`, the set for a sheet of a set, and `cells` where each cell carries its own version (value, counter, author); no `row:` or `rep:` record remains
- [ ] #2 Merge is per cell: two GM tabs editing different fields of one sheet both keep their edit, two edits of one cell settle on the latest version on all clients (CAP-11), and a null block record deletes the block and wins over its cells
- [ ] #3 Snapshot export, import, catch-up, room copy and every command use the new records; a snapshot with `row:` or `rep:` records is refused as older-version
- [ ] #4 The room copy for tests/fixtures/presets/d20.json is measured with src/core/snapshot-size.test.ts and recorded in _bmad-output/specs/spec-muster-roll/storage-and-sync.md
- [ ] #5 Unit and e2e tests cover the per-cell merge and the block delete
<!-- AC:END -->
