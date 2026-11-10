---
id: TASK-21
title: 3.2 Mark the Owner of a Character
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
labels:
  - epic-3
milestone: m-2
dependencies:
  - TASK-20
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
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want to mark which player owns a character, So that the player finds their character first.

Story 3.2 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: The GM marks owners and grants write access. A player's edit takes effect after a GM client checks it, and the player sees when the edit waits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Given** the access panel **When** the GM picks a player in the radio group "Его персонаж" **Then** a `plink:` record is written, any previous owner's record is tombstoned, and the character has at most one owner (FR19, UX-DR12) **And** an `acl:` record for that player is written, so editing turns on
- [ ] #2 **Given** two GM clients pick different owners at once **When** both `plink:` records merge **Then** every client treats the record with the highest `(c, a)` as the only owner (FR19) **And** the next owner change tombstones all other `plink:` records of that sheet
- [ ] #3 **Given** a player with an `acl:` or `plink:` record who is not in the room **When** the panel renders **Then** the player keeps a row under the last known name
- [ ] #4 **Given** a sheet with a `plink:` record **When** the GM deletes it **Then** that record is tombstoned (FR17)
- [ ] #5 **Given** a player is the owner **When** the GM clears "Может править" for that player **Then** write access is off, and the owner link stays (FR19)
- [ ] #6 **Given** the radio option "Никто" **When** the GM picks it **Then** the owner link is removed, and write access stays as it was
- [ ] #7 **Given** a character owned by player A **When** the GM picks player B in "Его персонаж" **Then** B becomes the owner, and A's write access stays until the GM clears it (FR19)
- [ ] #8 **Given** a player owns a character **When** that player's tab bar renders **Then** that character is first and marked "вы" (FR19, UX-DR8) **And** a player who owns several characters sees them first, by `(order, sheetId)`
<!-- AC:END -->
