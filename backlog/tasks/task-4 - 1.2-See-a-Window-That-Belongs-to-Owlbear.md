---
id: TASK-4
title: 1.2 See a Window That Belongs to Owlbear
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-10T15:38:00Z'
labels:
  - epic-1
milestone: m-0
dependencies:
  - TASK-3
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
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want the window to follow the Owlbear theme and look like part of Owlbear, So that the extension does not distract from the table.

Story 1.2 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: The GM loads a preset for any game system, creates and fills characters and NPCs, and keeps every change after a reload. The extension is live on its permanent URL.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Given** the `DESIGN.md` tokens **When** the theme builds **Then** Tailwind exposes all colors, typography styles, radii and spacing steps (UX-DR1) **And** the UI uses the system font only, no shadows inside the window, no color coding for game concepts, and no icon where a word fits except the gear (UX-DR4)
- [ ] #2 **Given** a window is open **When** `OBR.theme` changes **Then** every token updates by the `DESIGN.md` runtime table with no reload, including the `color-mix` tokens (UX-DR2, NFR14) **And** hex values of theme-mapped tokens apply only in tests and mocks, and warning and danger tokens are fixed hex values in production
- [ ] #3 **Given** the Owlbear light theme **When** a warning or danger pair renders **Then** it uses the `-light` tokens, and text contrast is at least 4.5:1 in both themes (UX-DR3, UX-DR36)
- [ ] #4 **Given** the window shell **When** it renders **Then** it holds the tab bar, an optional banner and one scrolling content area with padding `spacing-3` (UX-DR5) **And** gaps use `spacing-1` inside a row, `spacing-2` between controls and `spacing-4` between sections (UX-DR5) **And** tabs use `md` on the top corners, the window `lg`, chips `full` and buttons `sm` (UX-DR4) **And** the owner confirms or adjusts the 720 by 600 px window size in a live room (human gate, UX-DR7, NFR15)
- [ ] #5 **Given** the shared Button, Chip and Field primitives, which later stories use **When** one has keyboard focus **Then** a 2 px outline in `focus` shows, and the control's touch target is at least 32 px high (UX-DR36)
- [ ] #6 **Given** a disabled primitive **When** it renders **Then** it shows at 50% opacity with a text reason near it (UX-DR34)
- [ ] #7 **Given** a primitive **When** the GM uses touch or a mouse **Then** tap and click act the same, and the primitive has no hover-only or drag behavior (UX-DR34)
- [ ] #8 **Given** interface strings **When** a developer adds a string from the `EXPERIENCE.md` Voice and Tone table **Then** it comes from one copy catalog that holds the exact Russian text (UX-DR33) **And** on any conflict with `mockups/shell.html`, `EXPERIENCE.md` and `DESIGN.md` win (UX-DR37)
<!-- AC:END -->
