---
id: TASK-26
title: 4.3 Duplicate an NPC
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
labels:
  - epic-4
milestone: m-3
dependencies:
  - TASK-25
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
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want several copies of an NPC, So that each token has its own NPC.

Story 4.3 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: Anyone who sees a sheet can roll its dice, and the right clients see the result. The GM duplicates NPCs and links tokens, and a sheet opens from its token.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Given** an NPC block **When** the GM picks "Дублировать…" in "⋯" **Then** an inline number field from 1 to 50 with default 1 opens (UX-DR19, UX-DR20)
- [ ] #2 **Given** a count that is empty, not a number, fractional, below 1 or above 50 **When** the GM confirms **Then** "Нужно число от 1 до 50" shows under the field, and nothing is written
- [ ] #3 **Given** "Скелет 1" and a count of 9 **When** the GM confirms **Then** nine NPCs "Скелет 2" to "Скелет 10" appear at the end with the same values (FR16) **And** they are new `sheet:`, `row:` and `rep:` records under new `sheetId` values at `c: 1`, with no `link:` record (AD-2)
- [ ] #4 **Given** other NPCs with higher numbers **When** copies are named **Then** numbering continues from the highest existing number + 1, and a source with no number stays as is (UX-DR20) **And** source "Скелет" with a count of 2 gives "Скелет 1" and "Скелет 2"
- [ ] #5 **Given** a copy **When** the GM edits it **Then** the other copies and the source do not change (FR16)
<!-- AC:END -->
