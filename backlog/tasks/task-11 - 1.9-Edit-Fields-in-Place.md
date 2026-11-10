---
id: TASK-11
title: 1.9 Edit Fields in Place
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
  - TASK-10
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
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want to click a value and type, So that a sheet stays current with no edit mode.

Story 1.9 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: ### Epic 2: The Whole Table Sees the Same Sheets
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
- [ ] #1 **Given** a `check` field **When** the GM clicks it **Then** it toggles and saves on that click (UX-DR14) **And** unchecking stores `false`
- [ ] #2 **Given** a `text` or `number` field **When** the GM types **Then** the value saves on blur or after a typing pause, never per keystroke **And** change is measured against the value at focus or at the last pause save, and a blur with no user change sends nothing and shows the current record value
- [ ] #3 **Given** a changed field **When** the tab changes or the window closes before the pause or blur **Then** a valid value is saved first, and on `pagehide` it is sent ahead of the spacing queue **And** an invalid value is not saved
- [ ] #4 **Given** a changed field **When** it saves **Then** the window sends a field patch, `replica` merges it into the `row:` record, and the value stays after a reload (FR1) **And** a `number` value is stored as a JSON number, and a cleared field has no key (NFR9)
- [ ] #5 **Given** a `number` field with text that is not a number **When** the GM leaves it **Then** "Нужно число" shows under the field, the text stays, and nothing saves **And** one `core` number parser accepts `1,5` as 1.5 and refuses `1e999` and spaces only
- [ ] #6 **Given** a value that makes its whole record too long for one message **When** the GM leaves the field **Then** "Слишком длинно" shows under the field, the text stays, and nothing saves
- [ ] #7 **Given** an editing field **When** the GM presses `Enter` in a `number` or single-line `text` field **Then** the value commits **And** `Shift+Enter` adds a line in `text`, and `Esc` cancels the unsaved edit and returns the current value (UX-DR35)
- [ ] #8 **Given** a sheet **When** the GM presses Tab **Then** focus moves through the tab bar, the header, then fields in preset order (UX-DR35)
- [ ] #9 **Given** an empty value **When** the field renders **Then** it shows an empty editable area (UX-DR14)
<!-- AC:END -->
