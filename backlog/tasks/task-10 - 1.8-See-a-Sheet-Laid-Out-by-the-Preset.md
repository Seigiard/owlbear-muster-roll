---
id: TASK-10
title: 1.8 See a Sheet Laid Out by the Preset
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
  - TASK-9
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
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want the preset to decide what a sheet shows and how it is arranged, So that any game system fits with no code change.

Story 1.8 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: ### Epic 2: The Whole Table Sees the Same Sheets
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
- [ ] #1 **Given** a section with `columns` **When** the sheet renders **Then** all its rows share one grid, and the section scrolls horizontally if the grid does not fit (FR5, UX-DR6)
- [ ] #2 **Given** a section with no `columns` **When** the sheet renders **Then** its rows flow inline
- [ ] #3 **Given** sections with widths `1/3`, `1/2` or `full` **When** the sheet renders **Then** the sections flow side by side and wrap as whole blocks, and below 480 px each takes the full width (UX-DR6) **And** `full` is the default width, and any change to section width waits for the owner's decision through a Backlog task that also amends `preset-format.md`
- [ ] #4 **Given** preset cells **When** they render **Then** `text` renders its label, `field` its value and `dice` its label as static text, the nearest preceding `text` cell in its row, otherwise its formula (UX-DR13) **And** a field's accessible name is the nearest preceding `text` cell in its row, otherwise its id
- [ ] #5 **Given** a rendered sheet **When** styles apply **Then** even preset rows use `surface-stripe`, an editable value has a dotted underline in `line-strong`, and sections use `section-heading` in `accent` with a left rule in `line` (UX-DR15) **And** field rows are at least 32 px high (UX-DR36)
<!-- AC:END -->
