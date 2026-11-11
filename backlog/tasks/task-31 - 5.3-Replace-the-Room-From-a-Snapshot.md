---
id: TASK-31
title: 5.3 Replace the Room From a Snapshot
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-11T11:01:00Z'
labels:
  - epic-5
milestone: m-4
dependencies:
  - TASK-30
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
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want to load a snapshot into a room, So that a campaign moves to another room or computer.

Story 5.3 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: The GM changes the preset over existing sheets with one confirmation, and moves a campaign to another room through a snapshot file. A real session proves the release.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **Given** a valid file **When** the GM presses "Загрузить снимок" **Then** one confirmation shows "Все данные комнаты будут заменены. Игроки потеряют привязки и права. Загрузить снимок?", with "Не войдут значения удалённых полей: {count}." added when values are dropped (FR13, UX-DR25) **And** nothing is written before the confirmation **And** the confirmation follows the Story 1.7 close rules and closes when `catching-up` starts
- [x] #2 **Given** an invalid or newer file **When** the GM uploads it **Then** the bad file or newer file message (Story 1.5) appears under the button, and nothing changes
- [x] #3 **Given** a file value whose type differs from the current field type **When** `core/snapshot` reads it **Then** the value is dropped and counted in `{count}`
- [x] #4 **Given** a field still in the template of the sheet's kind but in another row **When** `core/snapshot` reads it **Then** the value is placed by field id, and only an id absent from that template or moved across a `repeat` boundary is dropped and counted
- [x] #5 **Given** local persistence of the new generation fails **When** the import runs **Then** the import stops before the snapshot and `reset`, the local-save notice shows, and nothing changes
- [x] #6 **Given** the confirmation **When** the GM confirms **Then** the importer takes a higher generation, persists it, writes the snapshot and only then broadcasts `reset` (AD-9) **And** `core/snapshot` outputs records at `c: 1`, the current `preset`, all `link:` records from the file, and no `acl:` or `plink:` record
- [x] #7 **Given** the new snapshot does not fit the 15500 limit or fails read-back **When** the import runs **Then** the import still finishes and `reset` goes out, the not-saved banner shows, and a room copy with a lower generation than the importer's is removed, so players with no GM do not read replaced data
- [x] #8 **Given** a token link in the file **When** the token exists in the room **Then** the link works, and a link to an absent token is inert (FR13)
- [x] #9 **Given** a client sees a higher generation, also through the snapshot writer **When** it adopts it **Then** it drops its pending queue with the notification "Данные комнаты заменены" and runs catch-up (UX-DR31) **And** it keeps its old copy until the new generation is complete, then deletes it, where complete means all `n` messages of one responder or a decoded new-generation room copy **And** while its generation is incomplete, a client stays in `catching-up` past the timeout, writes no snapshot, does not answer `state-request`, `ping` or `propose`, and repeats `state-request` with backoff from the constants module
- [x] #10 **Given** a client starts after an import **When** it reads its persisted records and the snapshot **Then** it takes the highest generation among them (AD-9)
- [x] #11 **Given** an imported room **When** players view sheets **Then** every player is read-only and no owner is set (FR13)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add the snapshot import with placement and drop counting in core.
2. Add the check and confirmed import commands in replica.
3. Add reset, generation adoption, the incomplete state and completion.
4. Add the confirmation UI.
5. Test with unit, engine and Playwright tests.
Spec: _bmad-output/implementation-artifacts/spec-5-3-replace-the-room-from-a-snapshot.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All eleven criteria verified on the mock room with unit, engine and Playwright tests. Owner decision: trust the table for home use, so a higher-generation room copy is adopted. Not yet observed in a live Owlbear room.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
"Загрузить снимок" reads the 5.2 file (bad and newer files refused with the 1.5 messages, plus "это не снимок"). core/snapshot-import places values by field id with the 5.1 section rules and counts drops; records come out at c: 1 with the current preset and file links, no acl:/plink:. One confirmation (with the drop count, digest re-check, 1.7 close rules, catch-up close). The importer takes { n+1, connection id }, persists with an incomplete marker, writes the room copy (never over a higher one) and broadcasts reset; GM writes wait meanwhile. Clients adopt a higher generation from reset, any GM message or the room copy: drop outbox, proposals and intents with "Данные комнаты заменены", keep old data until complete, stay catching-up with jittered backoff, then delete lower generations. Start ignores incomplete generations. Verified on the mock: lint, typecheck, 1835 unit tests, 389 Playwright tests twice, build. Not yet observed in a live Owlbear room.
<!-- SECTION:FINAL_SUMMARY:END -->
