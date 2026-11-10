---
id: TASK-12
title: 1.10 Keep a Different Number of Rows per Character
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-10T15:38:00Z'
labels:
  - epic-1
milestone: m-0
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

Story 1.10 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: The GM loads a preset for any game system, creates and fills characters and NPCs, and keeps every change after a reload. The extension is live on its permanent URL.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Given** a `repeat` section and edit rights **When** the GM presses "Добавить строку" **Then** a `rep:` record with a nanoid `instanceId` and an `order` is created, and the row appears at the end (UX-DR16, FR5) **And** other characters keep their own row counts
- [ ] #2 **Given** a repeat row **When** the GM presses its "Удалить" **Then** its record becomes a tombstone, and the row disappears
- [ ] #3 **Given** a field in a repeat row **When** it saves **Then** `replica` merges the patch into `cells` of its `rep:` record, a cleared field has no key, `order` is kept, and the Story 1.9 validation errors apply (FR5)
- [ ] #4 **Given** two rows with one `order` **When** the section renders **Then** the tie is broken by id, the same on every reload
- [ ] #5 **Given** a field id used inside a repeat row and elsewhere on the sheet **When** `core/preset` resolves that id from the row **Then** the id in the same row wins, then an id in the same sheet, and an id never resolves across characters (FR5)
<!-- AC:END -->
