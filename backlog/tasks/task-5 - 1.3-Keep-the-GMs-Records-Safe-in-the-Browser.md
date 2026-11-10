---
id: TASK-5
title: 1.3 Keep the GM's Records Safe in the Browser
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
  - TASK-4
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
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want every record stored in my browser with a version, So that a stale tab cannot overwrite newer data.

Story 1.3 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: ### Epic 2: The Whole Table Sees the Same Sheets
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
- [ ] #1 **Given** two records of one key **When** `core/merge` compares them **Then** the record with the higher `(c, a)` wins, comparing `c` as a number and `a` as a string (AD-3) **And** property tests show merge is commutative, associative and idempotent
- [ ] #2 **Given** a record candidate **When** it is parsed **Then** only the AD-2 key forms are valid, and `d: null` is a tombstone **And** a field value is a JSON number, string or boolean, and an empty field has no key
- [ ] #3 **Given** a new edit of a key **When** a version is minted **Then** `c` is the highest known `c` for that key + 1, and device time is not part of the version **And** one connection never emits one `(k, c, a)` with two different `d`
- [ ] #4 **Given** a GM client writes a record **When** the storage port stores it **Then** the key is `mr1:{roomId}:{n}:{a}:{k}`, and one synchronous step reads that key, merges and sets it (AD-11) **And** a lower-version write from a stale tab leaves the newer stored record (FR1)
- [ ] #5 **Given** a storage write that fails **When** `core` or the storage port handles it **Then** the caller gets a result that reports the failure, and no exception is thrown for this expected case
- [ ] #6 **Given** no import has happened **When** a client reads the room generation **Then** it is `{ n: 0, a: "" }`
<!-- AC:END -->
