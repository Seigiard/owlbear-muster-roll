---
id: TASK-9
title: 1.7 Delete a Sheet With One Confirmation
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
  - TASK-8
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
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want to delete a sheet after one confirmation, So that a mistake does not cost me a character.

Story 1.7 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: ### Epic 2: The Whole Table Sees the Same Sheets
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
- [ ] #1 **Given** a character header **When** the GM picks "Удалить" in "⋯" **Then** one inline block shows "Удалить «{name}»? Это нельзя отменить." at the top of the content area, and focus moves to "Отменить" (UX-DR25, UX-DR10)
- [ ] #2 **Given** the confirmation **When** the GM presses "Отменить" **Then** nothing changes
- [ ] #3 **Given** an open confirmation **When** its target disappears, the tab changes or the window closes **Then** the confirmation closes, and nothing is deleted
- [ ] #4 **Given** the confirmation **When** the GM confirms **Then** one batch tombstones the `sheet:` record and every `row:`, `rep:`, `acl:`, `link:` and `plink:` record of that sheet (AD-2, FR17) **And** the sheet does not return after a reload **And** a `replica` test seeds records of the deleted sheet, of a second sheet and `preset`, and shows that all five dependent forms of the target are tombstoned, including a `link:` found by its `d`, and that `preset` and the second sheet are unchanged
- [ ] #5 **Given** the active sheet is deleted **When** the tab closes **Then** the first available tab becomes active (UX-DR9)
<!-- AC:END -->
