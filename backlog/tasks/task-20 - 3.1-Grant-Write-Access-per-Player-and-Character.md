---
id: TASK-20
title: 3.1 Grant Write Access per Player and Character
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-11T05:30:00Z'
labels:
  - epic-3
milestone: m-2
dependencies:
  - TASK-19
  - TASK-37
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
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want to turn editing on or off for a player on one character, So that only the right people change a sheet.

Story 3.1 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: The GM marks owners and grants write access. A player's edit takes effect after a GM client checks it, and the player sees when the edit waits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **Given** a character header on a GM client **When** the GM presses the "Доступ" chip **Then** the panel opens inline under the header on `surface-bar` with a `line` border and `md` radius (UX-DR12, UX-DR10)
- [x] #2 **Given** the panel **When** it renders **Then** it has one row per player id, GMs excluded, from players in the room and players who already hold rights, by last known name **And** it shows the guest note "Гость привязан к своему браузеру. Из другого браузера доступ придётся выдать снова."
- [x] #3 **Given** no players **When** the panel renders **Then** it shows "Пока никого нет"
- [x] #4 **Given** the checkbox "Может править" **When** the GM changes it **Then** an `acl:{sheetId}:{playerId}` record is written or tombstoned at once, with the last known name (FR3, NFR7) **And** that player's header changes between "Можно править" and "Только чтение" (UX-DR10)
- [x] #5 **Given** a sheet with `acl:` records **When** the GM deletes it **Then** those records are tombstoned (FR17)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Build access panel rows from the party and records.
2. Add the acl-set GM command.
3. Add the Доступ chip, inline panel and player header text.
4. Test with unit, engine and Playwright tests.
Spec: _bmad-output/implementation-artifacts/spec-3-1-grant-write-access-per-player-and-character.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per spec-3-1: core/access (rows, canEdit, playerIdSchema), acl-set GM command with not-character and invalid-player-id refusals, party list in projection/delta for GM windows, Доступ chip + inline AccessPanel, player header Можно править / Только чтение. Tests: core/access.test.ts, replica/engine-access.test.ts, tests/access.e2e.ts; field-edit tab-order test updated for the new chip. All verification commands pass. Not committed; awaiting review.

All five criteria verified on the mock room with unit, engine and Playwright tests. New catalog strings: 'Пока никого нет' (empty panel), '{name}: может править' (checkbox name), 'Не удалось изменить доступ. Попробуйте ещё раз.'. Not yet observed in a live Owlbear room.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The GM character header has a "Доступ" chip that opens an inline access panel (surface-bar, line border, md radius). It lists one row per player id from the room and from live acl:/plink: records, GMs and this client excluded, by last known name, with the guest note, or "Пока никого нет". "Может править" writes acl:{sheetId}:{playerId} = { name } or tombstones it at once through a new acl-set GM command; failures and a 5 s timeout revert the box with a message. Projections carry a bounded, deduped party list for GMs. The player header shows "Можно править" or "Только чтение". Sheet delete tombstones acl:. Players get not-allowed. Verified on the mock: lint, typecheck, unit tests, Playwright, build. Not yet observed in a live Owlbear room.
<!-- SECTION:FINAL_SUMMARY:END -->
