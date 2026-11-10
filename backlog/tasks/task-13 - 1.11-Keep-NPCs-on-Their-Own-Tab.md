---
id: TASK-13
title: 1.11 Keep NPCs on Their Own Tab
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
  - TASK-12
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
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want all NPCs on one page from the short template, So that I manage a fight without opening many sheets.

Story 1.11 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: ### Epic 2: The Whole Table Sees the Same Sheets
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
- [ ] #1 **Given** a loaded preset **When** the GM views the tab bar **Then** the NPC tab and then the gear stay pinned at the right, and characters and NPCs never share a list (UX-DR8, UX-DR9) **And** with no characters the GM sees "+", NPC and the gear (UX-DR27)
- [ ] #2 **Given** the NPC tab with no NPCs **When** it renders **Then** it shows "Добавить NPC" only (UX-DR27)
- [ ] #3 **Given** the NPC tab **When** the GM presses "Добавить NPC" **Then** a sheet named "Новый NPC" with `kind: "npc"` is created and its name has focus (UX-DR11, FR17)
- [ ] #4 **Given** an NPC block **When** it renders **Then** it shows the name in `section-heading` with a left rule in `line`, click to rename, "⋯" with "Удалить", and the short template content, editable in place (UX-DR19, FR1) **And** "Удалить" uses the Story 1.7 confirmation
- [ ] #5 **Given** a `repeat` section in the NPC template **When** the GM adds or removes a row **Then** each NPC keeps its own rows (UX-DR16, FR5)
- [ ] #6 **Given** two preset fixtures for two different game systems **When** each is loaded in turn in a fresh room **Then** both give working character and NPC sheets with no code change (FR4, NFR12)
<!-- AC:END -->
