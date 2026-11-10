---
id: TASK-8
title: 1.6 Create and Name Characters
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-10T15:38:00Z'
labels:
  - epic-1
milestone: m-0
dependencies:
  - TASK-7
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
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want to add and name characters in tabs, So that the party has a place in the room.

Story 1.6 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: The GM loads a preset for any game system, creates and fills characters and NPCs, and keeps every change after a reload. The extension is live on its permanent URL.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Given** a loaded preset **When** the GM presses "+" **Then** a sheet named "Новый персонаж" is created with a nanoid `sheetId`, an `order` and `kind: "pc"`, its tab opens and the name has focus (UX-DR11, FR17)
- [ ] #2 **Given** a character header on a GM client **When** the GM clicks the name, changes it and leaves the field **Then** the tab and header show the new name, and it stays after a reload (UX-DR10) **And** the name renders in `sheet-title` with a bottom rule in `line`
- [ ] #3 **Given** an empty, whitespace-only or too long name, where too long means over 100 characters, a named constant **When** the GM leaves the name field **Then** an empty or whitespace-only name returns the old name with nothing saved, and a too long name shows "Слишком длинно" and is not saved
- [ ] #4 **Given** more character tabs than fit **When** the GM scrolls horizontally or with a vertical mouse wheel **Then** the tabs scroll, and the gear stays pinned at the right (UX-DR8) **And** "+" follows the last character, scrolls with the tabs and is a button outside the tab list **And** tabs sort by `(order, sheetId)`, the same on every client and reload
- [ ] #5 **Given** focus in the tab list **When** the GM presses arrow keys **Then** focus moves between tabs through react-aria tabs (UX-DR36)
<!-- AC:END -->
