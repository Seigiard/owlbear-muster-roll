---
id: TASK-10
title: 1.8 See a Sheet Laid Out by the Preset
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-10T20:29:00Z'
labels:
  - epic-1
milestone: m-0
dependencies:
  - TASK-9
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
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want the preset to decide what a sheet shows and how it is arranged, So that any game system fits with no code change.

Story 1.8 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: The GM loads a preset for any game system, creates and fills characters and NPCs, and keeps every change after a reload. The extension is live on its permanent URL.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **Given** a section with `columns` **When** the sheet renders **Then** all its rows share one grid, and the section scrolls horizontally if the grid does not fit (FR5, UX-DR6)
- [x] #2 **Given** a section with no `columns` **When** the sheet renders **Then** its rows flow inline
- [x] #3 **Given** sections with widths `1/3`, `1/2` or `full` **When** the sheet renders **Then** the sections flow side by side and wrap as whole blocks, and below 480 px each takes the full width (UX-DR6) **And** `full` is the default width, and any change to section width waits for the owner's decision through a Backlog task that also amends `preset-format.md`
- [x] #4 **Given** preset cells **When** they render **Then** `text` renders its label, `field` its value and `dice` its label as static text, the nearest preceding `text` cell in its row, otherwise its formula (UX-DR13) **And** a field's accessible name is the nearest preceding `text` cell in its row, otherwise its id
- [x] #5 **Given** a rendered sheet **When** styles apply **Then** even preset rows use `surface-stripe`, an editable value has a dotted underline in `line-strong`, and sections use `section-heading` in `accent` with a left rule in `line` (UX-DR15) **And** field rows are at least 32 px high (UX-DR36)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add the pure value lookup and label rules to core.
2. Build the sheet renderer: sections, widths, grids, inline rows, repeat instances and read-only cells.
3. Render it under the character header.
4. Verify with unit tests and Playwright with real pages and seeded records.
Spec: _bmad-output/implementation-artifacts/spec-1-8-see-a-sheet-laid-out-by-the-preset.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per spec-1-8: core/sheet-values.ts (row values, ordered repeat instances, labels and names, value display) with unit tests; ui/sheet/sheet-body.tsx, preset-section.tsx, preset-cell.tsx render the character template read-only under the header; tests/sheet-layout.e2e.ts covers every spec matrix row with real window and background pages. Format, lint, typecheck, bun test (605), Playwright (153) and vite build pass. Owner check pending: example preset in a live room, light and dark themes.

All five criteria verified on the mock adapter with real pages in Playwright, in both themes and at 420 px. Not yet observed in a live Owlbear room.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A character tab now shows the character template under its header: sections with widths 1/3, 1/2 and full that wrap as blocks and go full width below 480 px; columns sections as one subgrid that scrolls sideways; inline rows; repeat instances in (order, instanceId) order; text labels, read-only field values and dice labels as static text; stripes, section headings and dotted value underlines. Values come from row: and rep: records. Verified on the mock adapter: lint, typecheck, unit tests, Playwright, build. Not yet observed in a live Owlbear room.
<!-- SECTION:FINAL_SUMMARY:END -->
