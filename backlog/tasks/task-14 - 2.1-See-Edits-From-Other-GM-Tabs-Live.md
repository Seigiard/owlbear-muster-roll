---
id: TASK-14
title: 2.1 See Edits From Other GM Tabs Live
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
labels:
  - epic-2
milestone: m-1
dependencies:
  - TASK-13
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
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want my tabs and devices to share edits at once, So that any of them can be used during play.

Story 2.1 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: Players read every character and no NPC. Edits sync live between GM tabs and devices. The room copy lets players read with no GM and lets the GM re-enter from another device.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Given** a GM edit **When** `replica` applies it **Then** it takes a new `c`, merges, persists and goes out as `commit` on `app.muster-roll/sync` with destination `REMOTE` (AD-4, AD-5) **And** pending `commit` batches are coalesced by key
- [ ] #2 **Given** two GM tabs **When** each edits a different row at once **Then** both edits stay on all clients (FR11, NFR10)
- [ ] #3 **Given** two GM tabs **When** both edit one row at once **Then** all clients settle on the same latest record (FR11) **And** no code elects or waits for a specific GM client (AD-1)
- [ ] #4 **Given** a GM client creates, renames or deletes a sheet **When** the commit arrives **Then** the change shows on every client that can see that sheet (FR17) **And** a remote delete of the active sheet activates the first available tab and closes its confirmation (UX-DR9)
- [ ] #5 **Given** an inbound room message **When** the gate handles it **Then** the sender's role and id come from `event.connectionId` through the party port, re-read once on a miss **And** the envelope `{ v }` is read first, then the message is parsed by a zod schema, and any combination not in the AD-5 table is dropped **And** "Known player" in AD-5 means any party member with a known connection id, GMs included
- [ ] #6 **Given** a message with another `v` **When** it arrives **Then** it is dropped, and a higher `v` shows the banner "Вышла новая версия. Перезагрузите страницу." (AD-12, UX-DR24)
- [ ] #7 **Given** a value edited by another client **When** the commit arrives **Then** the value updates in place unless that field has focus **And** a focused field keeps its text, and `Esc` returns it to the current value (UX-DR32)
<!-- AC:END -->
