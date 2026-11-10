---
id: TASK-16
title: 2.3 Let Players Read Every Character and No NPC
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
labels:
  - epic-2
milestone: m-1
dependencies:
  - TASK-15
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
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a player, I want to read all characters in the room, So that I know the current state of the party.

Story 2.3 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: Players read every character and no NPC. Edits sync live between GM tabs and devices. The room copy lets players read with no GM and lets the GM re-enter from another device.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Given** a player client after catch-up **When** the window renders **Then** a tab for every character shows with its full sheet, and no NPC, no NPC tab, no gear and no "+" show (FR2, UX-DR8) **And** `core/visibility` now applies the player rules, views get sheets only through it, and the player loading-only rule of Story 1.4 no longer applies
- [ ] #2 **Given** a player **When** the character header renders **Then** it shows "Только чтение" (UX-DR10) **And** read-only values take no focus (UX-DR14), and "Добавить строку" and "Удалить" do not show in repeat sections (UX-DR16)
- [ ] #3 **Given** no preset and a GM client that answered catch-up **When** a player opens the window **Then** it shows "ГМ ещё не настроил листы." (UX-DR27)
- [ ] #4 **Given** a preset and no characters **When** a player opens the window **Then** it shows "ГМ ещё не создал персонажей." (UX-DR27)
- [ ] #5 **Given** a GM client viewing the NPC tab or Settings, or with a confirmation open **When** its role changes to player **Then** the first available tab becomes active, and the confirmation closes (UX-DR9)
<!-- AC:END -->
