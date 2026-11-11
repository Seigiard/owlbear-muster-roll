---
id: TASK-28
title: 4.5 Open a Sheet From Its Token
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-11T03:34:00Z'
labels:
  - epic-4
milestone: m-3
dependencies:
  - TASK-27
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
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a GM or a player, I want to open a sheet from the token on the map, So that I do not search through tabs in play.

Story 4.5 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: Anyone who sees a sheet can roll its dice, and the right clients see the result. The GM duplicates NPCs and links tokens, and a sheet opens from its token.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **Given** a token linked to a character **When** a GM or a player picks "Открыть лист" **Then** the window opens on that character's tab, and the tab scrolls into view (FR14, UX-DR8, UX-DR21) **And** when the window was closed, `replica` holds the requested tab, delivers it once to the action window, and discards it if the sheet is not visible to this role
- [x] #2 **Given** a token linked to an NPC **When** the GM picks "Открыть лист" **Then** the window opens the NPC tab and scrolls to that NPC (FR14, UX-DR9)
- [x] #3 **Given** a token linked to an NPC **When** a player opens its menu **Then** "Открыть лист" does not show (FR14, UX-DR21)
- [x] #4 **Given** a token with no link **When** a player opens its menu **Then** no Muster Roll item shows (UX-DR21)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add the open item filters by role to the token menu.
2. Hold an open request in the background and deliver it once.
3. Select and scroll to the sheet in the window.
4. Test with unit, engine and Playwright tests.
Spec: _bmad-output/implementation-artifacts/spec-4-5-open-a-sheet-from-its-token.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per spec-4-5: open item with GM and player icons in core/token-links, held open request in the engine (deliver at once and after each projection, drop on ack, discard when not live or not visible), window selects tab and scrolls (reduced motion respected), mock actionOpens. Unit, engine and e2e tests added; full suite, lint, typecheck, format and build green. ACs not checked yet: live-room owner check pending.

All four criteria verified on the mock room with unit, engine and Playwright tests. Owlbear per-icon filters and roles are checked as data only; confirm in a live room.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
"Открыть лист" joins the token menu (order: link, open, unlink) as one item with two icons: GMs see it on any token linked to a live sheet, players only on tokens linked to a live character. A press makes the background hold { id, sheetId } for up to 15 s, open the action window, and send open-sheet after each projection until a window acknowledges it; it is dropped on expiry, on a rejected action.open, or when the sheet is no longer live or visible to the role. The window takes the request after its first load, selects the character tab or the NPC tab, scrolls the tab or NPC block into view (no smooth scroll under reduced motion), and moves focus there when focus was in the window. Epic 4 is complete. Verified on the mock: lint, typecheck, unit tests, Playwright, build. Not yet observed in a live Owlbear room.
<!-- SECTION:FINAL_SUMMARY:END -->
