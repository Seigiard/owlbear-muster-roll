---
id: TASK-20
title: 3.1 Grant Write Access per Player and Character
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
labels:
  - epic-3
milestone: m-2
dependencies:
  - TASK-19
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
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want to turn editing on or off for a player on one character, So that only the right people change a sheet.

Story 3.1 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: The GM marks owners and grants write access. A player's edit takes effect after a GM client checks it, and the player sees when the edit waits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Given** a character header on a GM client **When** the GM presses the "Доступ" chip **Then** the panel opens inline under the header on `surface-bar` with a `line` border and `md` radius (UX-DR12, UX-DR10)
- [ ] #2 **Given** the panel **When** it renders **Then** it has one row per player id, GMs excluded, from players in the room and players who already hold rights, by last known name **And** it shows the guest note "Гость привязан к своему браузеру. Из другого браузера доступ придётся выдать снова."
- [ ] #3 **Given** no players **When** the panel renders **Then** it shows "Пока никого нет"
- [ ] #4 **Given** the checkbox "Может править" **When** the GM changes it **Then** an `acl:{sheetId}:{playerId}` record is written or tombstoned at once, with the last known name (FR3, NFR7) **And** that player's header changes between "Можно править" and "Только чтение" (UX-DR10)
- [ ] #5 **Given** a sheet with `acl:` records **When** the GM deletes it **Then** those records are tombstoned (FR17)
<!-- AC:END -->
