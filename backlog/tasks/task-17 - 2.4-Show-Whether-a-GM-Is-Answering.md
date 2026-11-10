---
id: TASK-17
title: 2.4 Show Whether a GM Is Answering
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
labels:
  - epic-2
milestone: m-1
dependencies:
  - TASK-16
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
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a player, I want to see when no GM client responds, So that I do not assume the table is live.

Story 2.4 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: Players read every character and no NPC. Edits sync live between GM tabs and devices. The room copy lets players read with no GM and lets the GM re-enter from another device.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Given** a client with no GM-origin message for half the timeout **When** the timer fires **Then** it sends `ping` (AD-6)
- [ ] #2 **Given** a GM client that is not `catching-up` **When** a `ping` arrives **Then** it answers `alive` on receipt with the generation and the digest, which is the XOR of a hash of `(k, c, a)` over all records
- [ ] #3 **Given** a player client, whatever the party list shows **When** no GM-origin message arrives within the timeout **Then** `gmLink` is `offline`, and the banner shows "Нет связи с ГМ. Правки ждут его и пропадут, если закрыть вкладку." (UX-DR24, FR15) **And** `replica` alone sets `gmLink`, the party list never sets it, and the projection carries it to every window **And** `gmLink` starts `offline` with no banner until the first catch-up ends
- [ ] #4 **Given** a GM client, also one alone in the room **When** no other GM client answers **Then** it never shows the no-GM banner, because its own edits apply
- [ ] #5 **Given** a hidden GM tab that still answers **When** a client pings it **Then** `gmLink` stays `online` (NFR11)
- [ ] #6 **Given** a GM-origin message after an offline period **When** it arrives **Then** `gmLink` becomes `online`, and the banner disappears
- [ ] #7 **Given** `alive` from one GM client of the client's own generation **When** it shows a different digest twice in a row **Then** the client enters `catching-up` (AD-7) **And** after a catch-up that held all `n` messages from that GM client, its digest is ignored until it changes, so a lagging GM does not cause a loop, and a timeout exit does not start the ignore
<!-- AC:END -->
