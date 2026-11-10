---
id: TASK-32
title: 5.4 Prove the Release in a Real Session
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
labels:
  - epic-5
milestone: m-4
dependencies:
  - TASK-31
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
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want one real session with the extension as the only record, So that I know the POC holds.

Story 5.4 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: The GM changes the preset over existing sheets with one confirmation, and moves a campaign to another room through a snapshot file. A real session proves the release.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Given** a preset for a second game system, built by hand **When** it is loaded in a room **Then** working sheets appear with no code change (FR4, NFR17)
- [ ] #2 **Given** a release candidate deployed by the owner (human gate) **When** the release check runs in a live room **Then** preset upload and download, a GM edit, owner assignment, a player edit, a character roll, an NPC roll seen only by GM clients, a token open, a no-GM read, an edit followed by closing the window at once, and snapshot download and import all work, because the mock proves app logic only (AD-17)
- [ ] #3 **Given** one real session with the party and NPCs kept only in the extension (human gate) **When** the session ends **Then** a snapshot exported at session end matches one exported after a reload on the same device and re-entry on a second GM device, and the owner records any value reported as lost in Backlog (NFR17) **And** deferred timeouts, pauses and spacing are confirmed or adjusted from that session
<!-- AC:END -->
