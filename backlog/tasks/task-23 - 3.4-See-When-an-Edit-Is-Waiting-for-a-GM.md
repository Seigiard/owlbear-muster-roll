---
id: TASK-23
title: 3.4 See When an Edit Is Waiting for a GM
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
labels:
  - epic-3
milestone: m-2
dependencies:
  - TASK-22
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
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a player with access, I want to see that my edit has not applied yet, So that I know whether the sheet is current.

Story 3.4 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: The GM marks owners and grants write access. A player's edit takes effect after a GM client checks it, and the player sees when the edit waits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Given** a player types a change **When** the field updates **Then** the typed value shows at once (UX-DR28) **And** the "Ожидает" mark in `label-sm` on the warning pair appears after a short delay with no answer, or at once with no GM (UX-DR3)
- [ ] #2 **Given** no GM client responds **When** a player edits **Then** the edit does not apply to any client, the no-GM banner shows, the sheets stay readable and the edit stays visible (FR15, UX-DR29) **And** the entry is resent with backoff
- [ ] #3 **Given** a pending edit **When** a GM client responds and commits **Then** the mark disappears with no message and no player action (FR15, UX-DR29)
- [ ] #4 **Given** a pending new repeat row or removed repeat row **When** the section renders **Then** the new row carries the mark, and the removed row stays dimmed with the mark and has its inputs disabled (UX-DR28)
- [ ] #5 **Given** the GM revokes access during an edit **When** the player's client receives the change **Then** the field returns to read-only and the edit is dropped, with "Нет прав на правку" (UX-DR29)
<!-- AC:END -->
