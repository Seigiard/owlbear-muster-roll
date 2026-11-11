---
id: TASK-19
title: 2.6 Read Characters With No GM Online
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-11T01:22:00Z'
labels:
  - epic-2
milestone: m-1
dependencies:
  - TASK-18
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
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a player, I want to read the last room copy before the GM joins, So that I can prepare without waiting.

Story 2.6 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: Players read every character and no NPC. Edits sync live between GM tabs and devices. The room copy lets players read with no GM and lets the GM re-enter from another device.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **Given** no GM online and a room copy **When** a player opens the window and catch-up times out **Then** the player sees every character from the copy and the no-GM banner (FR10) **And** no NPC shows, and no live edit is exchanged
- [x] #2 **Given** no GM online and no room copy **When** a player opens the window **Then** it shows "ГМ ещё не заходил. Листов пока нет." with the no-GM banner (UX-DR27)
- [x] #3 **Given** no GM online and a room copy with a higher `v` **When** a player opens the window **Then** the new-version banner shows, and the copy is not read (AD-12)
- [x] #4 **Given** no GM online and a room copy that does not decode **When** a player opens the window **Then** it shows "Копия в комнате не читается. Дождитесь ГМ." with the no-GM banner
- [x] #5 **Given** a player reading with no GM **When** a GM client joins and answers **Then** the banner disappears and the sheets update to current data
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Carry the player-visible room-copy outcome in the projection.
2. Add the no-GM player states by data source.
3. Catch up when a GM starts answering again.
4. Verify with engine tests and Playwright with a player alone and seeded copies.
Spec: _bmad-output/implementation-artifacts/spec-2-6-read-characters-with-no-gm-online.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation started from spec-2-6: roomCopy.outcome (read/none/unreadable/newer, null before the first catch-up read) in the projection; gm-return catch-up trigger on gmLink offline->online while live; player empty states by data source.

Implemented per spec-2-6 Implementation Notes. Verified: oxfmt check, lint, typecheck, bun test (1124 pass, 3 runs), test:browser (275 pass, 2 runs), vite build. Risk: a live GM tab that hears a new GM tab stays in gm-return catch-up up to catchUpTimeoutMs; its edits wait in the pending queue.

Review fixes (f8a8d0e): gm-return for players only, with jitter; held state-requests answered when a GM leaves catch-up; re-ask with the same r when a GM comes online during catch-up; late own-r answer no longer starts gm-return; outcome unreadable for another generation and for a failed read with none known; outcome defaults to null; trigger 'return' renamed 'page-return'. The earlier GM-delay risk no longer applies.

All five criteria verified on the mock room with engine tests and Playwright with a player alone and seeded room copies. Not yet observed in a live Owlbear room.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Players can now read with no GM online. After a catch-up that timed out, a player uses a readable room copy as its data source: every character shows read-only, no NPC, with the no-GM banner. With no copy it shows "ГМ ещё не заходил. Листов пока нет."; with an undecodable copy, a copy of another generation or a failed read, "Копия в комнате не читается. Дождитесь ГМ."; with a newer-build copy, the new-version banner and "Загрузка…". A player whose gmLink returns online enters catch-up (after jitter), and a GM that could not answer during its own catch-up answers remembered requests on exit, so the player gets current data and the banner goes. Players send no edits. Epic 2 is complete. Verified on the mock: lint, typecheck, unit tests, Playwright, build. Not yet observed in a live Owlbear room.
<!-- SECTION:FINAL_SUMMARY:END -->
