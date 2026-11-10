---
id: TASK-9
title: 1.7 Delete a Sheet With One Confirmation
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-10T19:37:00Z'
labels:
  - epic-1
milestone: m-0
dependencies:
  - TASK-8
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
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want to delete a sheet after one confirmation, So that a mistake does not cost me a character.

Story 1.7 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: The GM loads a preset for any game system, creates and fills characters and NPCs, and keeps every change after a reload. The extension is live on its permanent URL.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **Given** a character header **When** the GM picks "Удалить" in "⋯" **Then** one inline block shows "Удалить «{name}»? Это нельзя отменить." at the top of the content area, and focus moves to "Отменить" (UX-DR25, UX-DR10)
- [x] #2 **Given** the confirmation **When** the GM presses "Отменить" **Then** nothing changes
- [x] #3 **Given** an open confirmation **When** its target disappears, the tab changes or the window closes **Then** the confirmation closes, and nothing is deleted
- [x] #4 **Given** the confirmation **When** the GM confirms **Then** one batch tombstones the `sheet:` record and every `row:`, `rep:`, `acl:`, `link:` and `plink:` record of that sheet (AD-2, FR17) **And** the sheet does not return after a reload **And** a `replica` test seeds records of the deleted sheet, of a second sheet and `preset`, and shows that all five dependent forms of the target are tombstoned, including a `link:` found by its `d`, and that `preset` and the second sheet are unchanged
- [x] #5 **Given** the active sheet is deleted **When** the tab closes **Then** the first available tab becomes active (UX-DR9)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add the dependent-record rule to core.
2. Add sheet-delete to the engine as one batch of tombstones.
3. Build the header menu and the inline confirmation with its closing rules.
4. Verify with unit tests, the seeded replica test and Playwright with real pages.
Spec: _bmad-output/implementation-artifacts/spec-1-7-delete-a-sheet-with-one-confirmation.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All five criteria verified on the mock adapter with real background and window pages in Playwright. Also fixed a TASK-8 defect: a window opened while the background already runs now selects the first character. Not yet observed in a live Owlbear room.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The GM can delete a sheet from "⋯" in the header after one inline confirmation; cancel, Escape, a tab change or the target's disappearance close it with nothing deleted. sheet-delete tombstones the sheet and every row:, rep:, acl:, plink: and link: record of it in one batch, dependents first and the sheet last; a batch stops at its first failed write, so a retry reaches the rest. After a delete, the first available tab is selected and takes focus. Also fixed: a window opened while the background runs now selects the first character. Verified on the mock adapter: lint, typecheck, unit tests, Playwright, build. Not yet observed in a live Owlbear room.
<!-- SECTION:FINAL_SUMMARY:END -->
