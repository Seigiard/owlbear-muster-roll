---
id: TASK-8
title: 1.6 Create and Name Characters
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
labels:
  - epic-1
milestone: >-
  Epic 1: GM Runs the Campaign Sheets

  The GM loads a preset for any game system, creates and fills characters and
  NPCs, and keeps every change after a reload. The extension is live on its
  permanent URL.

  **FRs covered:** FR1, FR4, FR5, FR12, FR17
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

Story 1.6 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: ### Epic 2: The Whole Table Sees the Same Sheets
Players read every character and no NPC. Edits sync live between GM tabs and devices. The room copy lets players read with no GM and lets the GM re-enter from another device.
**FRs covered:** FR2, FR9, FR10, FR11

### Epic 3: Players Edit Their Own Characters
The GM marks owners and grants write access. A player's edit takes effect after a GM client checks it, and the player sees when the edit waits.
**FRs covered:** FR3, FR15, FR19

### Epic 4: Dice and Tokens at the Table
Anyone who sees a sheet can roll its dice, and the right clients see the result. The GM duplicates NPCs and links tokens, and a sheet opens from its token.
**FRs covered:** FR6, FR7, FR14, FR16, FR18

### Epic 5: Change the Format and Move the Campaign
The GM changes the preset over existing sheets with one confirmation, and moves a campaign to another room through a snapshot file. A real session proves the release.
**FRs covered:** FR8, FR13

## Epic 1: GM Runs the Campaign Sheets

The GM loads a preset for any game system, creates and fills characters and NPCs, and keeps every change after a reload. The extension is live on its permanent URL.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Given** a loaded preset **When** the GM presses "+" **Then** a sheet named "Новый персонаж" is created with a nanoid `sheetId`, an `order` and `kind: "pc"`, its tab opens and the name has focus (UX-DR11, FR17)
- [ ] #2 **Given** a character header on a GM client **When** the GM clicks the name, changes it and leaves the field **Then** the tab and header show the new name, and it stays after a reload (UX-DR10) **And** the name renders in `sheet-title` with a bottom rule in `line`
- [ ] #3 **Given** an empty, whitespace-only or too long name, where too long means over 100 characters, a named constant **When** the GM leaves the name field **Then** an empty or whitespace-only name returns the old name with nothing saved, and a too long name shows "Слишком длинно" and is not saved
- [ ] #4 **Given** more character tabs than fit **When** the GM scrolls horizontally or with a vertical mouse wheel **Then** the tabs scroll, and the gear stays pinned at the right (UX-DR8) **And** "+" follows the last character, scrolls with the tabs and is a button outside the tab list **And** tabs sort by `(order, sheetId)`, the same on every client and reload
- [ ] #5 **Given** focus in the tab list **When** the GM presses arrow keys **Then** focus moves between tabs through react-aria tabs (UX-DR36)
<!-- AC:END -->
