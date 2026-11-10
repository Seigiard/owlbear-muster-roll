---
id: TASK-13
title: 1.11 Keep NPCs on Their Own Tab
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-10T21:41:00Z'
labels:
  - epic-1
milestone: m-0
dependencies:
  - TASK-12
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
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want all NPCs on one page from the short template, So that I manage a fight without opening many sheets.

Story 1.11 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: The GM loads a preset for any game system, creates and fills characters and NPCs, and keeps every change after a reload. The extension is live on its permanent URL.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **Given** a loaded preset **When** the GM views the tab bar **Then** the NPC tab and then the gear stay pinned at the right, and characters and NPCs never share a list (UX-DR8, UX-DR9) **And** with no characters the GM sees "+", NPC and the gear (UX-DR27)
- [x] #2 **Given** the NPC tab with no NPCs **When** it renders **Then** it shows "Добавить NPC" only (UX-DR27)
- [x] #3 **Given** the NPC tab **When** the GM presses "Добавить NPC" **Then** a sheet named "Новый NPC" with `kind: "npc"` is created and its name has focus (UX-DR11, FR17)
- [x] #4 **Given** an NPC block **When** it renders **Then** it shows the name in `section-heading` with a left rule in `line`, click to rename, "⋯" with "Удалить", and the short template content, editable in place (UX-DR19, FR1) **And** "Удалить" uses the Story 1.7 confirmation
- [x] #5 **Given** a `repeat` section in the NPC template **When** the GM adds or removes a row **Then** each NPC keeps its own rows (UX-DR16, FR5)
- [x] #6 **Given** two preset fixtures for two different game systems **When** each is loaded in turn in a fresh room **Then** both give working character and NPC sheets with no code change (FR4, NFR12)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Give the sheet header an NPC block variant.
2. Fill the NPC tab: add, blocks from the NPC template, rename, delete, rows.
3. Add two preset fixtures of different game systems.
4. Verify with Playwright with real pages, both fixtures included.
Spec: _bmad-output/implementation-artifacts/spec-1-11-keep-npcs-on-their-own-tab.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per spec-1-11: NPC tab (src/ui/sheet/npc-tab.tsx) with 'Добавить NPC' and one block per NPC from preset.npc; CharacterHeader 'npc' variant (section-heading name, 2px left rule in line, label 'Имя NPC'); WindowRoot create/delete-confirmation/focus state now keyed by sheet record key for both kinds; NPC delete focus goes to next NPC '⋯', else previous, else 'Добавить NPC'. Copy: newNpc, label.npcName. Fixtures tests/fixtures/presets/d20.json and d6-pool.json. tests/npc.e2e.ts covers every matrix row (23 tests). Checks: oxfmt, lint, typecheck, bun test (742), test:browser (220), vite build all exit 0.

Review fixes: delete keeps its command id (refusal or failed send returns focus to '⋯'); NPC deleted elsewhere while asked moves focus by next/previous/'Добавить NPC'; focus targets apply only on the tab that lost focus; NPC creation no longer switches tabs; 'Добавить NPC' closes an open confirmation; CharacterHeader renamed SheetHeader (variant character|npc); NPC blocks are a ul/li list; shared storage/command test helpers moved to tests/support/room.ts; fixture parse unit test in src/core/preset.test.ts.

All six criteria verified on the mock adapter with real pages in Playwright, with two preset fixtures (d20 and d6 pool) loaded through the real upload. Not yet observed in a live Owlbear room.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The NPC tab now holds "Добавить NPC" and one block per NPC from the NPC template: a section-heading name with a left rule, click to rename, "⋯" with "Удалить" through the shared confirmation, fields and repeat rows editable in place. A new NPC is named "Новый NPC" and its name takes focus. After a delete, focus goes to the next NPC's "⋯", the previous one's, or "Добавить NPC"; a rejected delete returns focus to the sheet's "⋯" for characters and NPCs. CharacterHeader became SheetHeader. Two fixtures of different game systems prove that presets work with no code change. Shared e2e helpers moved to tests/support/room.ts. Verified on the mock adapter: lint, typecheck, unit tests, Playwright, build. Not yet observed in a live Owlbear room. Epic 1 is complete.
<!-- SECTION:FINAL_SUMMARY:END -->
