---
id: TASK-25
title: 4.2 Roll a Dice Cell and Show the Result
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-11T02:12:00Z'
labels:
  - epic-4
milestone: m-3
dependencies:
  - TASK-24
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
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As anyone who can see a sheet, I want to press a dice button, So that the table sees one result and I do not need to remember the rules.

Story 4.2 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: Anyone who sees a sheet can roll its dice, and the right clients see the result. The GM duplicates NPCs and links tokens, and a sheet opens from its token.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **Given** a valid dice cell **When** a client that can see the sheet presses its button, with or without write access **Then** that client's `replica` evaluates the formula once and sends one `roll` with `{ id, sheetId, kind, roller, sheetName, cell, result }` (AD-13, FR6) **And** the static label of Story 1.8 becomes a button styled by `dice-button` (UX-DR17)
- [x] #2 **Given** a roll from a character sheet **When** it arrives on all connected clients **Then** each client shows "{roller}: {sheet}, {cell} — {result}" through an Owlbear notification, also with the window closed (FR6, UX-DR18) **And** receivers do not recompute, and a duplicate `id` is ignored **And** the roller's own `replica` shows the result through the same `id` check, because `REMOTE` does not echo to the sender **And** only the background page calls the notification port **And** `{result}` holds the rolled number, and for a comparison also "успех" or "провал" **And** `cell` is the dice button's label by the Story 1.8 rule
- [x] #3 **Given** a roll from an NPC sheet **When** it arrives **Then** only GM clients show it (FR6, UX-DR18)
- [x] #4 **Given** a formula with bad input **When** a client presses the button **Then** "Нельзя бросить: поле «{field}» пустое или не число" shows under the button, and no roll and no broadcast occur (FR7, UX-DR17) **And** the message clears on the next roll or field change
- [x] #5 **Given** a formula error with no field name **When** a client presses the button **Then** "Нельзя бросить: формула не дала числа" shows under the button, and nothing is sent
- [x] #6 **Given** a client with a queued or pending edit in a referenced field **When** the client rolls **Then** the formula uses the value the client shows **And** a referenced field in an error state gives the field error and sends no roll
- [x] #7 **Given** any roll **When** it completes **Then** nothing about it enters records, storage or snapshots (AD-13)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add the roll room message and its gate row.
2. Add the roll intent with shown values and its reply.
3. Evaluate once in the roller replica, send, dedup and notify from the background page.
4. Make the dice cell a button with error messages under it.
5. Test with engine tests and Playwright on the mock room.
Spec: _bmad-output/implementation-artifacts/spec-4-2-roll-a-dice-cell-and-show-the-result.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All seven criteria verified on the mock room with engine tests (two GMs and a player) and Playwright. Not yet observed in a live Owlbear room. Added catalog string rollFailed 'Бросок не удался. Попробуйте ещё раз.' for a refused or failed roll.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Dice cells are now buttons (dice-button style, Story 1.8 label). A press sends a roll-request with the window's shown values; the roller's replica overlays them on records and pending edits, evaluates once through Story 4.1, sends one roll on the room channel and, after the send succeeds, shows it. Every replica shows a roll once by id through the notification port from the background page: '{roller}: {sheet}, {cell} — {result}', result in ru-RU format with 'успех' or 'провал' for a comparison. Players never show NPC rolls; a non-GM sender's NPC roll is dropped, and the roller name comes from the party list. Field and arithmetic errors show under the button and clear on the next press or any value change of that sheet; a refused or failed roll shows 'Бросок не удался. Попробуйте ещё раз.' A pending press ignores repeats. Rolls touch no records, storage or snapshots. Verified on the mock: lint, typecheck, unit tests, Playwright, build. Not yet observed in a live Owlbear room.
<!-- SECTION:FINAL_SUMMARY:END -->
