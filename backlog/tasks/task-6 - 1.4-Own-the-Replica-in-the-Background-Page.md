---
id: TASK-6
title: 1.4 Own the Replica in the Background Page
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
  - TASK-5
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
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want the data to live in the background page, So that closing the window loses nothing.

Story 1.4 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: ### Epic 2: The Whole Table Sees the Same Sheets
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
- [ ] #1 **Given** the background page starts on a GM client **When** it loads **Then** `src/replica` merges all persisted records of the current generation (AD-10) **And** a stored record that fails its schema is skipped, raises the local-save notice, and counts as absent when that key is next written **And** a player client persists nothing (AD-11)
- [ ] #2 **Given** a window opens **When** it sends `projection-request` on `app.muster-roll/ui` with destination `LOCAL` **Then** it receives a full projection, then deltas, and the projection holds records and notices, read through `core/visibility(role)` (AD-10) **And** `core/visibility` is a pass-through until player rules exist, and until then a player client shows only "Загрузка…" **And** the window repeats `projection-request` until the first part arrives, and restarts only after a timeout with an incomplete set, so a window that loads before the background page still gets one **And** a request carries a window nonce and the projection echoes it, so other windows ignore a projection that is not theirs **And** a projection split across messages carries `i of n` and a sequence number, and the window buffers deltas until it is complete
- [ ] #3 **Given** a window sends a command **When** `replica` handles it **Then** the command passes a zod schema in `core` and carries an intent, never a whole record **And** an echo of a message causes no second effect
- [ ] #4 **Given** a window is closed **When** the GM opens it again **Then** the same data shows (FR1)
- [ ] #5 **Given** many sends on either channel **When** they leave the client **Then** one serial queue spaces them, starting at 50 ms, and `RateLimitHit` is waited out with backoff (AD-12, NFR4) **And** one function splits batches so each message is under 15000 UTF-8 bytes of JSON, and a record that cannot fit one message is refused at input with an error (NFR3)
- [ ] #6 **Given** any timeout, pause, delay or send spacing **When** code needs the value **Then** it reads one named constants module with stated starting values, and tests inject them
- [ ] #7 **Given** a local write fails **When** the projection reports the notice **Then** a status banner under the tab bar shows "Не удалось сохранить в браузере. Скачайте снимок." at full window width, as a live region (UX-DR24) **And** the banner disappears when no failed or corrupt key remains
<!-- AC:END -->
