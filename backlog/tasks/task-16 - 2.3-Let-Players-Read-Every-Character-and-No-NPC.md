---
id: TASK-16
title: 2.3 Let Players Read Every Character and No NPC
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-10T23:30:00Z'
labels:
  - epic-2
milestone: m-1
dependencies:
  - TASK-15
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
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a player, I want to read all characters in the room, So that I know the current state of the party.

Story 2.3 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: Players read every character and no NPC. Edits sync live between GM tabs and devices. The room copy lets players read with no GM and lets the GM re-enter from another device.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **Given** a player client after catch-up **When** the window renders **Then** a tab for every character shows with its full sheet, and no NPC, no NPC tab, no gear and no "+" show (FR2, UX-DR8) **And** `core/visibility` now applies the player rules, views get sheets only through it, and the player loading-only rule of Story 1.4 no longer applies
- [x] #2 **Given** a player **When** the character header renders **Then** it shows "Только чтение" (UX-DR10) **And** read-only values take no focus (UX-DR14), and "Добавить строку" and "Удалить" do not show in repeat sections (UX-DR16)
- [x] #3 **Given** no preset and a GM client that answered catch-up **When** a player opens the window **Then** it shows "ГМ ещё не настроил листы." (UX-DR27)
- [x] #4 **Given** a preset and no characters **When** a player opens the window **Then** it shows "ГМ ещё не создал персонажей." (UX-DR27)
- [x] #5 **Given** a GM client viewing the NPC tab or Settings, or with a confirmation open **When** its role changes to player **Then** the first available tab becomes active, and the confirmation closes (UX-DR9)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Apply the player rules in core/visibility.
2. Re-project on a role change; carry whether the first catch-up was answered.
3. Render the read-only player window and its empty states.
4. Verify with unit tests and Playwright with a GM and a player client.
Spec: _bmad-output/implementation-artifacts/spec-2-3-let-players-read-every-character-and-no-npc.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Started build from spec-2-3. Plan: visibility rules in core with unit tests; engine re-projects on a role change by starting a new projection stream (new engine id) and carries sync.firstCatchUpAnswered; UI renders the player layout through core/visibility; tests/player.e2e.ts covers the matrix.

Implemented per spec-2-3: player rules in core/visibility (+ visibleSheets), engine re-projection on role change via new engine id, sync.firstCatchUpAnswered, read-only player layout and empty states, demotion fallback. Verified: oxfmt, lint, typecheck, bun test (977 pass), test:browser (256 pass), vite build. Not committed; review pending.

All five criteria verified on the mock room with a GM and a player client on real pages in Playwright. Not yet observed in a live Owlbear room.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Players now read every character and no NPC. core/visibility applies the player rules: NPC sheets are hidden, and a dependent record shows only when its sheet is a known live character. The engine diffs the visible set per player and withdraws keys that leave it, so a multi-part answer or a re-pointed link never leaves NPC data in a window. The player window shows character tabs only, "Только чтение" in the header, values as named read-only text, checks as "Label: отмечено", and no row controls. Empty states: "ГМ ещё не настроил листы." and "ГМ ещё не создал персонажей." after a GM answered; otherwise "Загрузка…". A role change re-projects; demotion closes Settings and confirmations and activates the first tab. Verified on the mock: lint, typecheck, unit tests, Playwright, build. Not yet observed in a live Owlbear room.
<!-- SECTION:FINAL_SUMMARY:END -->
