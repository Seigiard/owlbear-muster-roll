---
id: TASK-12
title: 1.10 Keep a Different Number of Rows per Character
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
  - TASK-11
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
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want to add and remove rows in repeat sections, So that each character has its own inventory.

Story 1.10 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: ### Epic 2: The Whole Table Sees the Same Sheets
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
- [ ] #1 **Given** a `repeat` section and edit rights **When** the GM presses "Добавить строку" **Then** a `rep:` record with a nanoid `instanceId` and an `order` is created, and the row appears at the end (UX-DR16, FR5) **And** other characters keep their own row counts
- [ ] #2 **Given** a repeat row **When** the GM presses its "Удалить" **Then** its record becomes a tombstone, and the row disappears
- [ ] #3 **Given** a field in a repeat row **When** it saves **Then** `replica` merges the patch into `cells` of its `rep:` record, a cleared field has no key, `order` is kept, and the Story 1.9 validation errors apply (FR5)
- [ ] #4 **Given** two rows with one `order` **When** the section renders **Then** the tie is broken by id, the same on every reload
- [ ] #5 **Given** a field id used inside a repeat row and elsewhere on the sheet **When** `core/preset` resolves that id from the row **Then** the id in the same row wins, then an id in the same sheet, and an id never resolves across characters (FR5)
<!-- AC:END -->
