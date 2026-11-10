---
id: TASK-1
title: Check Owlbear platform unknowns for Muster Roll
status: To Do
assignee: []
created_date: '2026-11-10T05:34:00Z'
labels: []
dependencies: []
documentation:
  - _bmad-output/specs/spec-muster-roll/SPEC.md
  - _bmad-output/specs/spec-muster-roll/storage-and-sync.md
priority: high
type: spike
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Muster Roll POC has no server: it relies on broadcast between clients, a background page, the Owlbear player id and room metadata. The Owlbear docs leave the behaviour of these open, and nothing has run in a live room. If any of them fails, the storage, sync or write-rights design changes, so the answers must come before architecture is final.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In a live room, two GM tabs and a player edit the same row and different rows at once; the record states whether all clients end with the same data and whether an edit was lost
- [ ] #2 With the GM extension window closed and the tab in the background, the record states how long the `background_url` page stayed alive and whether player edits reached the GM
- [ ] #3 The record states whether a guest keeps the player id after a reload and in another browser, and whether a logged-in player keeps it across later sessions
- [ ] #4 The record states whether a write right can bind to a guest or only to a logged-in player
- [ ] #5 The record states what Owlbear does when room metadata is written past 16kB
- [ ] #6 Each result is recorded in the Muster Roll spec through `bmad-spec`, and the matching open question is closed
<!-- AC:END -->
