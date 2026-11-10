---
id: TASK-27
title: 4.4 Link a Token to a Sheet
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
labels:
  - epic-4
milestone: m-3
dependencies:
  - TASK-26
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
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want to link a token to a sheet from its menu, So that the sheet is one click from the map.

Story 4.4 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: Anyone who sees a sheet can roll its dice, and the right clients see the result. The GM duplicates NPCs and links tokens, and a sheet opens from its token.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Given** a token with no sheet **When** a GM opens its Owlbear menu **Then** "Привязать лист…" shows, and it opens a small Owlbear popover (UX-DR21, UX-DR22) **And** every Muster Roll token menu item applies to one selected token only (`max: 1`)
- [ ] #2 **Given** the link picker **When** it renders **Then** it lists characters, then NPCs, with sheets with no token first **And** with no sheets it shows "Сначала создайте лист" (UX-DR22)
- [ ] #3 **Given** the GM picks a sheet **When** the link saves **Then** a `link:{tokenId}` record is written, a token links to one sheet, and a sheet can have many tokens (FR18) **And** a link to a deleted sheet is refused, and a menu treats it as no link **And** the read-only status in the character header and NPC block shows "Токен привязан", otherwise "Нет токена" (UX-DR10, UX-DR19) **And** the status and the picker order read `link:` records only, so a token absent from the room still shows as linked in v1
- [ ] #4 **Given** a linked token **When** the GM picks "Отвязать лист" **Then** the `link:` record is tombstoned, and the sheet and the token stay (FR18, UX-DR21)
- [ ] #5 **Given** the `link:` or `sheet:` records or the client's role change **When** the delta arrives, also after the first catch-up **Then** the context menu is re-created with filters built from current records and role, because SDK filters are static and match item keys only
- [ ] #6 **Given** a sheet with a `link:` record **When** the GM deletes it **Then** that record is tombstoned (FR17)
<!-- AC:END -->
