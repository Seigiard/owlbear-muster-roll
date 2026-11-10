---
id: TASK-12
title: 1.10 Keep a Different Number of Rows per Character
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-10T21:17:00Z'
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
- [x] #1 **Given** a `repeat` section and edit rights **When** the GM presses "Добавить строку" **Then** a `rep:` record with a nanoid `instanceId` and an `order` is created, and the row appears at the end (UX-DR16, FR5) **And** other characters keep their own row counts
- [x] #2 **Given** a repeat row **When** the GM presses its "Удалить" **Then** its record becomes a tombstone, and the row disappears
- [x] #3 **Given** a field in a repeat row **When** it saves **Then** `replica` merges the patch into `cells` of its `rep:` record, a cleared field has no key, `order` is kept, and the Story 1.9 validation errors apply (FR5)
- [x] #4 **Given** two rows with one `order` **When** the section renders **Then** the tie is broken by id, the same on every reload
- [x] #5 **Given** a field id used inside a repeat row and elsewhere on the sheet **When** `core/preset` resolves that id from the row **Then** the id in the same row wins, then an id in the same sheet, and an id never resolves across characters (FR5)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add the field id resolution rule to core/preset.
2. Add repeat-row-add and repeat-row-delete to the engine.
3. Add the row controls with focus rules.
4. Verify with unit tests, engine tests and Playwright with real pages.
Spec: _bmad-output/implementation-artifacts/spec-1-10-keep-a-different-number-of-rows-per-character.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All five criteria verified on the mock adapter with real pages in Playwright. Not yet observed in a live Owlbear room.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The GM can add rows to a repeat section with "Добавить строку" and remove one with its "Удалить"; each character keeps its own rows. repeat-row-add creates rep:{sheetId}:{sectionId}:{instanceId} with a window nanoid and the next order; repeat-row-delete tombstones it. Focus moves to the new row's first field, or to the next delete control, unless the GM moved on. core/preset gains resolveFieldReference: same row, then the sheet's non-repeat scope, never another repeat section or character. Verified on the mock adapter: lint, typecheck, unit tests, Playwright, build. Not yet observed in a live Owlbear room.
<!-- SECTION:FINAL_SUMMARY:END -->
