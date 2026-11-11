---
id: TASK-27
title: 4.4 Link a Token to a Sheet
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-11T03:04:00Z'
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
- [x] #1 **Given** a token with no sheet **When** a GM opens its Owlbear menu **Then** "Привязать лист…" shows, and it opens a small Owlbear popover (UX-DR21, UX-DR22) **And** every Muster Roll token menu item applies to one selected token only (`max: 1`)
- [x] #2 **Given** the link picker **When** it renders **Then** it lists characters, then NPCs, with sheets with no token first **And** with no sheets it shows "Сначала создайте лист" (UX-DR22)
- [x] #3 **Given** the GM picks a sheet **When** the link saves **Then** a `link:{tokenId}` record is written, a token links to one sheet, and a sheet can have many tokens (FR18) **And** a link to a deleted sheet is refused, and a menu treats it as no link **And** the read-only status in the character header and NPC block shows "Токен привязан", otherwise "Нет токена" (UX-DR10, UX-DR19) **And** the status and the picker order read `link:` records only, so a token absent from the room still shows as linked in v1
- [x] #4 **Given** a linked token **When** the GM picks "Отвязать лист" **Then** the `link:` record is tombstoned, and the sheet and the token stay (FR18, UX-DR21)
- [x] #5 **Given** the `link:` or `sheet:` records or the client's role change **When** the delta arrives, also after the first catch-up **Then** the context menu is re-created with filters built from current records and role, because SDK filters are static and match item keys only
- [x] #6 **Given** a sheet with a `link:` record **When** the GM deletes it **Then** that record is tombstoned (FR17)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add pure link, picker order and menu filter helpers.
2. Add link-set and link-clear GM commands and a menu owner in the background.
3. Add the picker popover page.
4. Show token status in sheet headers.
5. Extend the mock and test with unit, engine and Playwright tests.
Spec: _bmad-output/implementation-artifacts/spec-4-4-link-a-token-to-a-sheet.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per spec-4-4 (working tree, not committed): core/token-links helpers; link-set/link-clear GM commands; replica/token-menu owner wired in the engine (re-created after deltas and catch-up end, once the first catch-up is done; filters built from live links and role); picker.html popover page; token status chip in character header and NPC block; mock context menu and popover recording. Verified: oxfmt check, lint, typecheck, bun test (1343 pass), playwright (313 pass, incl. tests/link.e2e.ts), vite build (emits picker.html). Live-room manual check still open.

All six criteria verified on the mock room with unit, engine and Playwright tests. Owlbear filter semantics (some/every, CHARACTER layer) are checked as data only; confirm in a live room. New catalog strings: 'Сначала создайте лист', 'Не удалось привязать. Попробуйте ещё раз.', 'Не удалось отвязать лист. Попробуйте ещё раз.'
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
GMs can link tokens to sheets. The background replica owns two token menu items, re-created from live link: and sheet: records and the role whenever they change and after the first catch-up: "Привязать лист…" (GM, max 1, CHARACTER layer, tokens with no live link) opens a small picker popover, and "Отвязать лист" (GM, max 1, linked tokens via some) tombstones the link. The picker lists characters then NPCs, unlinked first, or "Сначала создайте лист"; a pick sends link-set and closes once the link is in the replica; failures and a 5 s timeout show a retry message. link-set refuses a non-live sheet; a link to a dead sheet counts as no link. Sheet headers and NPC blocks show "Токен привязан" or "Нет токена" from link: records only. Failed menu calls are retried on the next update; stop removes items; a rejected unlink shows a notification. Verified on the mock: lint, typecheck, unit tests, Playwright, build. Not yet observed in a live Owlbear room.
<!-- SECTION:FINAL_SUMMARY:END -->
