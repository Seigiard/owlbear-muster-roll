---
id: TASK-28
title: 4.5 Open a Sheet From Its Token
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
labels:
  - epic-4
milestone: m-3
dependencies:
  - TASK-27
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
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a GM or a player, I want to open a sheet from the token on the map, So that I do not search through tabs in play.

Story 4.5 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: Anyone who sees a sheet can roll its dice, and the right clients see the result. The GM duplicates NPCs and links tokens, and a sheet opens from its token.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Given** a token linked to a character **When** a GM or a player picks "Открыть лист" **Then** the window opens on that character's tab, and the tab scrolls into view (FR14, UX-DR8, UX-DR21) **And** when the window was closed, `replica` holds the requested tab, delivers it once to the action window, and discards it if the sheet is not visible to this role
- [ ] #2 **Given** a token linked to an NPC **When** the GM picks "Открыть лист" **Then** the window opens the NPC tab and scrolls to that NPC (FR14, UX-DR9)
- [ ] #3 **Given** a token linked to an NPC **When** a player opens its menu **Then** "Открыть лист" does not show (FR14, UX-DR21)
- [ ] #4 **Given** a token with no link **When** a player opens its menu **Then** no Muster Roll item shows (UX-DR21)
<!-- AC:END -->
