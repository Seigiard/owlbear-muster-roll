---
id: TASK-18
title: 2.5 Save a Room Copy That Survives the GM's Browser
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
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
- [ ] #1 **Given** a GM client that is not `catching-up` **When** edits pause, with jitter, or its page becomes hidden **Then** it reads the snapshot under `app.muster-roll/snapshot`, merges it, encodes all records with tombstones, versions and generation, sorted by key, deflated and base64-encoded, then writes and reads back (AD-8, FR9)
- [ ] #2 **Given** all room metadata with this key replaced is over 15500 UTF-8 bytes **When** the size check runs **Then** the write is skipped, the previous snapshot stays, and the danger banner shows "Копия в комнате не сохранена. Игра идёт дальше, но скачайте снимок." (FR9, NFR2)
- [ ] #3 **Given** the read snapshot has a higher `v` or does not decode **When** the writer reads it **Then** the write stops, and the not-saved notice shows
- [ ] #4 **Given** the read snapshot has a higher generation **When** the writer reads it **Then** the writer does not merge or write, and enters `catching-up`
- [ ] #5 **Given** a room copy with a lower generation than the client's own **When** a client reads it **Then** it is not merged, and a GM client overwrites it on its next write (AD-9)
- [ ] #6 **Given** a `resume` or visibility change falls between the read and the write **When** the writer continues **Then** the write stops
- [ ] #7 **Given** a write that was skipped or stopped, or a trigger during `catching-up` **When** catch-up ends or the next trigger fires **Then** the snapshot is scheduled again
- [ ] #8 **Given** a read-back that lacks a written record at an equal or higher version and has no higher generation **When** verification runs **Then** the same notice shows
- [ ] #9 **Given** a client in catch-up **When** a snapshot exists **Then** the client merges it before it broadcasts `state-request` (AD-7) **And** a GM client with no other GM connection merges it before it leaves `catching-up` **And** a GM on a new device gets the data from the snapshot (FR9, NFR8)
- [ ] #10 **Given** Settings **When** it renders **Then** the section "Копия в комнате" after "Пресет" shows "Сохранена" with the used and available size, or the not-saved message (UX-DR23) **And** with no room copy yet it shows "Не сохранена", and the available size is 15500 minus the bytes used by all room metadata
- [ ] #11 **Given** two or more active notices **When** the banner renders **Then** one shows, by priority: local save failed, room copy not saved, new version, no GM (UX-DR24) **And** the not-saved banner disappears after the next verified write
- [ ] #12 **Given** a synthetic party of 6 characters and 60 NPCs with Russian text in the real format, using the larger Story 1.11 preset fixture **When** the snapshot is encoded **Then** its byte size is recorded in the story notes against the 15500 limit (NFR16) **And** if the size is over 15500 bytes or the margin is under 1500 bytes, a Backlog task is created and the owner decides it before Epic 3 (human gate)
<!-- AC:END -->
