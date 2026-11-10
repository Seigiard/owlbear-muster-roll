---
id: TASK-31
title: 5.3 Replace the Room From a Snapshot
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
labels:
  - epic-5
milestone: m-4
dependencies:
  - TASK-30
references:
  - _bmad-output/planning-artifacts/epics.md
documentation:
  - _bmad-output/specs/spec-muster-roll/SPEC.md
  - _bmad-output/specs/spec-muster-roll/preset-format.md
  - _bmad-output/specs/spec-muster-roll/storage-and-sync.md
  - >-
    _bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/EXPERIENCE.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/DESIGN.md
type: feature
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want to load a snapshot into a room, So that a campaign moves to another room or computer.

Story 5.3 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: The GM changes the preset over existing sheets with one confirmation, and moves a campaign to another room through a snapshot file. A real session proves the release.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Given** a valid file **When** the GM presses "Загрузить снимок" **Then** one confirmation shows "Все данные комнаты будут заменены. Игроки потеряют привязки и права. Загрузить снимок?", with "Не войдут значения удалённых полей: {count}." added when values are dropped (FR13, UX-DR25) **And** nothing is written before the confirmation **And** the confirmation follows the Story 1.7 close rules and closes when `catching-up` starts
- [ ] #2 **Given** an invalid or newer file **When** the GM uploads it **Then** the bad file or newer file message (Story 1.5) appears under the button, and nothing changes
- [ ] #3 **Given** a file value whose type differs from the current field type **When** `core/snapshot` reads it **Then** the value is dropped and counted in `{count}`
- [ ] #4 **Given** a field still in the template of the sheet's kind but in another row **When** `core/snapshot` reads it **Then** the value is placed by field id, and only an id absent from that template or moved across a `repeat` boundary is dropped and counted
- [ ] #5 **Given** local persistence of the new generation fails **When** the import runs **Then** the import stops before the snapshot and `reset`, the local-save notice shows, and nothing changes
- [ ] #6 **Given** the confirmation **When** the GM confirms **Then** the importer takes a higher generation, persists it, writes the snapshot and only then broadcasts `reset` (AD-9) **And** `core/snapshot` outputs records at `c: 1`, the current `preset`, all `link:` records from the file, and no `acl:` or `plink:` record
- [ ] #7 **Given** the new snapshot does not fit the 15500 limit or fails read-back **When** the import runs **Then** the import still finishes and `reset` goes out, the not-saved banner shows, and a room copy with a lower generation than the importer's is removed, so players with no GM do not read replaced data
- [ ] #8 **Given** a token link in the file **When** the token exists in the room **Then** the link works, and a link to an absent token is inert (FR13)
- [ ] #9 **Given** a client sees a higher generation, also through the snapshot writer **When** it adopts it **Then** it drops its pending queue with the notification "Данные комнаты заменены" and runs catch-up (UX-DR31) **And** it keeps its old copy until the new generation is complete, then deletes it, where complete means all `n` messages of one responder or a decoded new-generation room copy **And** while its generation is incomplete, a client stays in `catching-up` past the timeout, writes no snapshot, does not answer `state-request`, `ping` or `propose`, and repeats `state-request` with backoff from the constants module
- [ ] #10 **Given** a client starts after an import **When** it reads its persisted records and the snapshot **Then** it takes the highest generation among them (AD-9)
- [ ] #11 **Given** an imported room **When** players view sheets **Then** every player is read-only and no owner is set (FR13)
<!-- AC:END -->
