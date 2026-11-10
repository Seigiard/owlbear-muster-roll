---
id: TASK-14
title: 2.1 See Edits From Other GM Tabs Live
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-10T22:16:00Z'
labels:
  - epic-2
milestone: m-1
dependencies:
  - TASK-13
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
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want my tabs and devices to share edits at once, So that any of them can be used during play.

Story 2.1 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: Players read every character and no NPC. Edits sync live between GM tabs and devices. The room copy lets players read with no GM and lets the GM re-enter from another device.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **Given** a GM edit **When** `replica` applies it **Then** it takes a new `c`, merges, persists and goes out as `commit` on `app.muster-roll/sync` with destination `REMOTE` (AD-4, AD-5) **And** pending `commit` batches are coalesced by key
- [x] #2 **Given** two GM tabs **When** each edits a different row at once **Then** both edits stay on all clients (FR11, NFR10)
- [x] #3 **Given** two GM tabs **When** both edit one row at once **Then** all clients settle on the same latest record (FR11) **And** no code elects or waits for a specific GM client (AD-1)
- [x] #4 **Given** a GM client creates, renames or deletes a sheet **When** the commit arrives **Then** the change shows on every client that can see that sheet (FR17) **And** a remote delete of the active sheet activates the first available tab and closes its confirmation (UX-DR9)
- [x] #5 **Given** an inbound room message **When** the gate handles it **Then** the sender's role and id come from `event.connectionId` through the party port, re-read once on a miss **And** the envelope `{ v }` is read first, then the message is parsed by a zod schema, and any combination not in the AD-5 table is dropped **And** "Known player" in AD-5 means any party member with a known connection id, GMs included
- [x] #6 **Given** a message with another `v` **When** it arrives **Then** it is dropped, and a higher `v` shows the banner "Вышла новая версия. Перезагрузите страницу." (AD-12, UX-DR24)
- [x] #7 **Given** a value edited by another client **When** the commit arrives **Then** the value updates in place unless that field has focus **And** a focused field keeps its text, and `Esc` returns it to the current value (UX-DR32)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add room message schemas and the AD-5 gate to core.
2. Map senders through the party port.
3. Send coalesced commits after GM edits; merge and persist inbound commits.
4. Show the new-version banner.
5. Extend the mock to several clients of one room.
6. Verify with unit tests, two-engine tests and Playwright with two clients.
Spec: _bmad-output/implementation-artifacts/spec-2-1-see-edits-from-other-gm-tabs-live.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per spec-2-1: core/room-messages (SYNC_CHANNEL, envelope v first, commit schema, AD-5 gate), replica/party-roster, replica/commit-outbox with SendQueue.enqueueComposed for coalescing, engine sends commits after applied GM writes and merges admitted commits (GM persists, player does not), new-version notice and warning banner, mock multi-client room (mock-client/player/role/name/device params, per-client LOCAL, per-room REMOTE, shared party). Tests: room-messages, party-roster, engine-sync (two engines on one memory room), mock room, send-queue, tests/sync.e2e.ts. fmt, lint, typecheck, bun test (883), test:browser (235), vite build all pass. Not committed; acceptance criteria not checked yet.

All seven criteria verified on the mock with two clients of one room, each with real background and window pages in Playwright, and with two engines on one in-memory room. Not yet observed in a live Owlbear room.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
GM edits now reach every other client of the room live. After a GM command is applied, merged and persisted, its records go out as a commit on app.muster-roll/sync (REMOTE) through the shared send queue; a commit outbox coalesces pending records by key and splits by the size limit. Inbound room messages are read v first (a higher v raises the new-version banner), then parsed by a core zod schema, then admitted by a pure AD-5 gate; senders resolve through a party roster with one shared re-read on a miss. Room messages are handled one at a time in arrival order. A GM receiver merges and persists; a player merges only and, until Epic 3, its write commands are refused as not-allowed. The mock now runs several clients of one room (mock-client, mock-player, mock-role, mock-name, mock-device). Verified on the mock: lint, typecheck, unit tests, Playwright, build. Not yet observed in a live Owlbear room.
<!-- SECTION:FINAL_SUMMARY:END -->
