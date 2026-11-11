---
id: TASK-37
title: Shorten new sheet and repeat-row ids to keep the room copy margin
status: To Do
assignee: []
created_date: '2026-11-11T04:43:00Z'
labels:
  - epic-2
milestone: m-1
dependencies:
  - TASK-34
references:
  - src/core/snapshot-size.test.ts
  - >-
    _bmad-output/implementation-artifacts/spec-2-5-save-a-room-copy-that-survives-the-gms-browser.md
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner decision on TASK-34: keep the room copy size margin by shortening newly generated ids. Random 21-character nanoid ids do not compress, and they are about half of the room copy. On the TASK-18 worst-case party (6 characters, 60 NPCs, tests/fixtures/presets/d20.json) the copy takes 15138 bytes, a margin of 362 against 15500. Measured with 12-character sheet ids and 8-character repeat-row instance ids it takes 12158 bytes, a margin of 3342. A repeat-row instance id must be unique only within one row of one sheet; a sheet id within one room. Ids already stored keep working: the schemas accept 1 to 64 characters, so no migration is needed. Today new ids come from `src/ui/main.tsx` (sheet create), `src/ui/sheet/use-repeat-rows.ts` (repeat rows) and the NPC duplicate composer in `src/replica/composers.ts`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 New sheet ids are 12 characters and new repeat-row instance ids are 8 characters, from the same URL-safe alphabet, for create, add row and NPC duplicate
- [ ] #2 Records with existing 21-character ids still load, merge, sync and appear in the room copy unchanged
- [ ] #3 bun test src/core/snapshot-size.test.ts measures the worst-case party with the new id lengths and prints a margin of at least 1500 bytes
- [ ] #4 A new id that collides with a live id in its scope is not written over it
<!-- AC:END -->
