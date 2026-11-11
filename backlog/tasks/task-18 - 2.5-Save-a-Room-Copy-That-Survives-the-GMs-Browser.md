---
id: TASK-18
title: 2.5 Save a Room Copy That Survives the GM's Browser
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-11T00:42:00Z'
labels:
  - epic-2
milestone: m-1
dependencies:
  - TASK-17
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
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want a compressed copy in the room, So that I can re-enter from another device.

Story 2.5 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: Players read every character and no NPC. Edits sync live between GM tabs and devices. The room copy lets players read with no GM and lets the GM re-enter from another device.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **Given** a GM client that is not `catching-up` **When** edits pause, with jitter, or its page becomes hidden **Then** it reads the snapshot under `app.muster-roll/snapshot`, merges it, encodes all records with tombstones, versions and generation, sorted by key, deflated and base64-encoded, then writes and reads back (AD-8, FR9)
- [x] #2 **Given** all room metadata with this key replaced is over 15500 UTF-8 bytes **When** the size check runs **Then** the write is skipped, the previous snapshot stays, and the danger banner shows "Копия в комнате не сохранена. Игра идёт дальше, но скачайте снимок." (FR9, NFR2)
- [x] #3 **Given** the read snapshot has a higher `v` or does not decode **When** the writer reads it **Then** the write stops, and the not-saved notice shows
- [x] #4 **Given** the read snapshot has a higher generation **When** the writer reads it **Then** the writer does not merge or write, and enters `catching-up`
- [x] #5 **Given** a room copy with a lower generation than the client's own **When** a client reads it **Then** it is not merged, and a GM client overwrites it on its next write (AD-9)
- [x] #6 **Given** a `resume` or visibility change falls between the read and the write **When** the writer continues **Then** the write stops
- [x] #7 **Given** a write that was skipped or stopped, or a trigger during `catching-up` **When** catch-up ends or the next trigger fires **Then** the snapshot is scheduled again
- [x] #8 **Given** a read-back that lacks a written record at an equal or higher version and has no higher generation **When** verification runs **Then** the same notice shows
- [x] #9 **Given** a client in catch-up **When** a snapshot exists **Then** the client merges it before it broadcasts `state-request` (AD-7) **And** a GM client with no other GM connection merges it before it leaves `catching-up` **And** a GM on a new device gets the data from the snapshot (FR9, NFR8)
- [x] #10 **Given** Settings **When** it renders **Then** the section "Копия в комнате" after "Пресет" shows "Сохранена" with the used and available size, or the not-saved message (UX-DR23) **And** with no room copy yet it shows "Не сохранена", and the available size is 15500 minus the bytes used by all room metadata
- [x] #11 **Given** two or more active notices **When** the banner renders **Then** one shows, by priority: local save failed, room copy not saved, new version, no GM (UX-DR24) **And** the not-saved banner disappears after the next verified write
- [x] #12 **Given** a synthetic party of 6 characters and 60 NPCs with Russian text in the real format, using the larger Story 1.11 preset fixture **When** the snapshot is encoded **Then** its byte size is recorded in the story notes against the 15500 limit (NFR16) **And** if the size is over 15500 bytes or the margin is under 1500 bytes, a Backlog task is created and the owner decides it before Epic 3 (human gate)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add core/snapshot: encode, decode, measure, read-back check.
2. Share room metadata across mock clients.
3. Add the AD-8 writer with triggers, interruption and rescheduling; merge the copy in catch-up.
4. Show the not-saved notice and the Settings section.
5. Measure the AC 12 party and record the size.
Spec: _bmad-output/implementation-artifacts/spec-2-5-save-a-room-copy-that-survives-the-gms-browser.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per the build spec. AC 12 measurement (bun test src/core/snapshot-size.test.ts): snapshot bytes: 15138, margin: 362 against the 15500 limit. Party: 6 characters and 60 NPCs, Russian text, every field filled, 4 attacks per character and 2 per NPC, a link per sheet, acl and plink per character, 433 records, on tests/fixtures/presets/d20.json. The margin is under 1500 bytes, so the human gate applies: TASK-34 holds the owner's decision, and TASK-20 (Epic 3) now depends on it.

AC 12 measurement: snapshot bytes 15138 for 6 characters and 60 NPCs with Russian text on tests/fixtures/presets/d20.json (433 records); margin 362 bytes against 15500. The margin is under 1500, so TASK-34 holds the human gate before Epic 3. All twelve criteria verified on the mock room with engine tests and Playwright. Not yet observed in a live Owlbear room.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
GM clients now keep a room copy in metadata (app.muster-roll/snapshot). A live GM writes after a 3 s edit pause plus up to 2 s jitter, after a merged remote commit, and at once when its page hides: read, merge, encode all records with tombstones, versions and generation sorted by key, deflate and base64 as { v, data }, measure all room metadata against 15500 bytes, write, and read back. The writer is single-flight, stops on resume or visibility change between read and write, and reschedules any skipped or failed write. Higher v, undecodable copies, failed read-backs and thrown writes raise the danger notice "Копия в комнате не сохранена…", which clears after the next verified write; a higher generation sends the writer into catch-up. Every catch-up merges the copy before state-request; a GM on a new device loads from it. Settings shows "Копия в комнате" with used and free kB. Banner priority: local save, room copy, new version, no GM. AC 12: 15138 bytes, margin 362, below the 1500 margin, so TASK-34 gates Epic 3. Verified on the mock: lint, typecheck, unit tests, Playwright, build. Not yet observed in a live Owlbear room.
<!-- SECTION:FINAL_SUMMARY:END -->
