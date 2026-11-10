---
id: TASK-19
title: 2.6 Read Characters With No GM Online
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
labels:
  - epic-2
milestone: m-1
dependencies:
  - TASK-18
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
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a player, I want to read the last room copy before the GM joins, So that I can prepare without waiting.

Story 2.6 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: Players read every character and no NPC. Edits sync live between GM tabs and devices. The room copy lets players read with no GM and lets the GM re-enter from another device.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Given** no GM online and a room copy **When** a player opens the window and catch-up times out **Then** the player sees every character from the copy and the no-GM banner (FR10) **And** no NPC shows, and no live edit is exchanged
- [ ] #2 **Given** no GM online and no room copy **When** a player opens the window **Then** it shows "ГМ ещё не заходил. Листов пока нет." with the no-GM banner (UX-DR27)
- [ ] #3 **Given** no GM online and a room copy with a higher `v` **When** a player opens the window **Then** the new-version banner shows, and the copy is not read (AD-12)
- [ ] #4 **Given** no GM online and a room copy that does not decode **When** a player opens the window **Then** it shows "Копия в комнате не читается. Дождитесь ГМ." with the no-GM banner
- [ ] #5 **Given** a player reading with no GM **When** a GM client joins and answers **Then** the banner disappears and the sheets update to current data
<!-- AC:END -->
