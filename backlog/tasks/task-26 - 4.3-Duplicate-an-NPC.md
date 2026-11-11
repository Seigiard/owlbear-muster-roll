---
id: TASK-26
title: 4.3 Duplicate an NPC
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-11T02:38:00Z'
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
- [x] #1 **Given** an NPC block **When** the GM picks "Дублировать…" in "⋯" **Then** an inline number field from 1 to 50 with default 1 opens (UX-DR19, UX-DR20)
- [x] #2 **Given** a count that is empty, not a number, fractional, below 1 or above 50 **When** the GM confirms **Then** "Нужно число от 1 до 50" shows under the field, and nothing is written
- [x] #3 **Given** "Скелет 1" and a count of 9 **When** the GM confirms **Then** nine NPCs "Скелет 2" to "Скелет 10" appear at the end with the same values (FR16) **And** they are new `sheet:`, `row:` and `rep:` records under new `sheetId` values at `c: 1`, with no `link:` record (AD-2)
- [x] #4 **Given** other NPCs with higher numbers **When** copies are named **Then** numbering continues from the highest existing number + 1, and a source with no number stays as is (UX-DR20) **And** source "Скелет" with a count of 2 gives "Скелет 1" and "Скелет 2"
- [x] #5 **Given** a copy **When** the GM edits it **Then** the other copies and the source do not change (FR16)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add pure naming and count parsing in core.
2. Compose the copy batch in the GM replica.
3. Add the inline duplicate block to the NPC menu.
4. Test with unit, engine and Playwright tests.
Spec: _bmad-output/implementation-artifacts/spec-4-3-duplicate-an-npc.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All five criteria verified on the mock room with unit, engine and Playwright tests. Not yet observed in a live Owlbear room. New catalog strings: 'Дублировать' (confirm), 'Количество копий (1–50)' (field label), 'Не удалось дублировать. Попробуйте ещё раз.' (failure).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
"Дублировать…" in an NPC block's ⋯ opens an inline count block (1–50, default 1, focused). A bad count shows "Нужно число от 1 до 50" and writes nothing. On confirm the GM replica writes one batch of full copies: new sheet:, row: and rep: records at c: 1 under new nanoid sheet and instance ids, no link: records, placed after the last NPC. Names drop a trailing number from the source and continue from the highest live namesake + 1, skipping taken names; an unnumbered source stays as is. Long bases are cut by grapheme to fit 100 characters. During catch-up the command waits like other GM intents; reserved ids are keyed by role so the replay writes the keys already shown. The block stays open until copies appear and shows a failure message on a rejection. Players get not-allowed. Verified on the mock: lint, typecheck, unit tests, Playwright, build. Not yet observed in a live Owlbear room.
<!-- SECTION:FINAL_SUMMARY:END -->
