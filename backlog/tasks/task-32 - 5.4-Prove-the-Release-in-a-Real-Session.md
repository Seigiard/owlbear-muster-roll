---
id: TASK-32
title: 5.4 Prove the Release in a Real Session
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-20T03:18:00Z'
labels:
  - epic-5
  - format-v4
  - owner-check
milestone: m-4
dependencies:
  - TASK-31
references:
  - _bmad-output/planning-artifacts/epics.md
  - TASK-79 AC 5
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
- [x] #1 **Given** a preset for a second game system, built by hand **When** it is loaded in a room **Then** working sheets appear with no code change (FR4, NFR17)
- [x] #2 **Given** a release candidate deployed by the owner (human gate) **When** the release check runs in a live room **Then** preset upload and download, a GM edit, owner assignment, a player edit, a character roll, an NPC roll seen only by GM clients, a token open, a no-GM read, an edit followed by closing the window at once, and snapshot download and import all work, because the mock proves app logic only (AD-17)
- [ ] #3 **Given** one real session with the party and NPCs kept only in the extension (human gate) **When** the session ends **Then** a snapshot exported at session end matches one exported after a reload on the same device and re-entry on a second GM device, and the owner records any value reported as lost in Backlog (NFR17) **And** deferred timeouts, pauses and spacing are confirmed or adjusted from that session
- [ ] #4 **Given** a verified nested-repeat (format v4) candidate deployed by the owner (human gate) **When** the owner checks it in a live room with an NPC repeat tab, an attacks section per NPC and a token cell per NPC **Then** the owner records the candidate commit and the check (merged from TASK-86 AC 1)
- [ ] #5 **Given** that candidate **When** a GM and a player edit different fields of one sheet at the same time **Then** both literal values remain on both clients and after reload (merged from TASK-86 AC 2)
- [ ] #6 **Given** that candidate **When** linked tokens are opened **Then** each opens its own NPC tab, and each NPC keeps its own nested attacks (merged from TASK-86 AC 3)
- [ ] #7 The owner records pass/fail evidence for the nested-repeat check and files any observed defects in Backlog; TASK-79's live-check criterion stays unchecked until that evidence exists (merged from TASK-86 AC 4)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Release check prepared by the agent (Epics 1-5 built and verified on the mock only):
- Second-system presets exist in tests/fixtures/presets; the owner decides whether one of them closes AC 1 or builds one by hand.
- Owner gate: deploy the release candidate (wrangler deploy is the owner's step).
- Live-room checklist: preset upload and download; GM edit; access panel and owner pick; player edit with the "Ожидает" mark (close the GM tab to see it at once, reopen to clear); revoke during an edit gives "Нет прав на правку"; character roll; NPC roll seen only by GM clients; token open; no-GM read; edit then close the window at once; "Скачать снимок" really saves a file in the Owlbear iframe; "Загрузить снимок" in a second room, a second GM tab sees "Данные комнаты заменены"; preset change over existing sheets with the erase confirmation; screen reader announces the row mark.
- Session gate: compare snapshots exported at session end, after a reload, and on a second GM device (same bytes expected for the same data).

Owner decision (AC 1): the existing tests/fixtures/presets/d6-pool.json counts as the second-system preset; loading it in the live room closes AC 1. A hand-built preset waits for the preset configurator (see the new configurator task).

2026-11-11, owner in a live room after deploy: AC 1 passed with tests/fixtures/presets/d6-pool.json (sheets work with no code change). AC 2 release checklist passed; it found TASK-39 (a sheet still shows "Токен привязан" after its token is deleted). AC 3 (one real session and the three-snapshot comparison) is postponed by the owner; the task stays open.

2026-11-20: TASK-86 (verify nested-repeat v4 in a live Owlbear room) merged into this task. Both are owner-only live-room gates and run in the same session. ACs 4-7 come from TASK-86. Its last status: owner-only gate, not run; mock, Chromium and build results do not close it; no deployment or live acceptance occurred.
<!-- SECTION:NOTES:END -->
