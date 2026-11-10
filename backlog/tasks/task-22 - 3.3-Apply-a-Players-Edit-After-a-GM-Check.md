---
id: TASK-22
title: 3.3 Apply a Player's Edit After a GM Check
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
labels:
  - epic-3
milestone: m-2
dependencies:
  - TASK-21
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
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a player with access, I want my edit to reach everyone once a GM client accepts it, So that sheets change only with the GM's permission.

Story 3.3 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: The GM marks owners and grants write access. A player's edit takes effect after a GM client checks it, and the player sees when the edit waits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Given** a player with access **When** the sheet renders **Then** the player's fields are editable
- [ ] #2 **Given** a player with access edits a field or a repeat row **When** the patch enters the pending queue **Then** the queue holds at most one entry per key, a newer edit updates the entry and raises `c`, and each key's entry is sent only in its newest version, with entries for different keys sent and resent independently (AD-4) **And** the player does not merge its own edit, and the projection exposes the pending queue
- [ ] #3 **Given** a GM client that is not `catching-up` **When** a valid `propose` with `c` above the current `c` arrives **Then** it merges the record with `c` and `a` unchanged and broadcasts `commit`, echoing `(k, c, a)` **And** a proposal identical to the current record gets the same `commit`, and two GM clients produce the same record
- [ ] #4 **Given** coalesced `commit` batches **When** a GM edit replaces a player's committed record in a batch **Then** the batch still carries the player's `(k, c, a)`, so the pending entry clears
- [ ] #5 **Given** a `commit` for an older `c` than the pending entry **When** it arrives **Then** the entry stays until a `commit` or `reject` matches its own `(k, c, a)`
- [ ] #6 **Given** a `propose` for a tombstoned or `npc` sheet, for an edit of a tombstoned `rep:` record, for a key outside the template of the sheet's kind in the current preset, with a field id absent from that template, with a value whose JSON type differs from its field type, for a sheet with no access, or in a key form reserved for the GM **When** `core/access` checks it **Then** the GM client sends `reject` with reason `denied`, echoing `(k, c, a)` (FR3, NFR6) **And** a sender still unknown after one party re-read is dropped by the AD-5 gate, and its entry stays pending under the normal backoff **And** `core/access` checks in this order: an identical record gets `commit`; a remove of a tombstoned `rep:` gets `commit` of the existing tombstone, echoing the proposer's `(k, c, a)`; an edit of a tombstoned `rep:` is `denied`; then the `c` check **And** a GM client never rewrites the `d` of a `propose`
- [ ] #7 **Given** `reject` with reason `denied` that echoes the `(k, c, a)` of this client's pending entry **When** the player receives it **Then** the entry is dropped, the value returns, and the notification "Нет прав на правку" shows (UX-DR29) **And** any `reject` that matches no pending entry of this client is ignored
- [ ] #8 **Given** a `propose` with a low `c` **When** the GM client answers `reject` with reason `stale` and the current record, echoing `(k, c, a)` **Then** the player applies its patch to that record, takes `c` + 1 and proposes again **And** if that record is a tombstone and the entry is an edit, the entry is dropped with the same notification
- [ ] #9 **Given** both `commit` and `reject` arrive for one edit **When** the player handles them **Then** `commit` wins **And** a `commit` that arrives after `denied` applies the value
- [ ] #10 **Given** a player with access **When** the player presses "Добавить строку" or a row's "Удалить" **Then** the change goes through the same path (FR3, UX-DR16) **And** an add entry holds `order` and cells, a remove entry holds `d: null`, and `d: null` from a player is valid only on a `rep:` key **And** on `stale` an add keeps its cells and a remove stays a remove
- [ ] #11 **Given** a player edits during `catching-up` **When** the client leaves `catching-up` **Then** the edit takes a fresh `c` and only then is proposed (AD-7)
- [ ] #12 **Given** a GM client in `catching-up` **When** a `propose` arrives **Then** it neither commits nor rejects (AD-4)
<!-- AC:END -->
