---
id: TASK-86
title: Verify nested-repeat v4 in a live Owlbear room
status: To Do
assignee: []
created_date: '2026-11-16T22:18:00Z'
labels:
  - format-v4
  - owner-check
dependencies: []
references:
  - TASK-79 AC 5
  - _bmad-output/specs/spec-muster-roll/stories.yaml
priority: medium
type: task
ordinal: 113000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-79 acceptance criterion 5 requires the owner to check the v4 candidate in a real Owlbear room. Mock and Chromium runs prove application behavior but cannot establish host behavior. Deployment and the owner-run room check are outside the autonomous agent run; this task records that human verification gate without claiming it passed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The owner records the candidate commit and a live-room check with an NPC repeat tab, an attacks section per NPC and a token cell per NPC.
- [ ] #2 A GM and a player edit different fields of one sheet concurrently; both literal values remain on both clients and after reload.
- [ ] #3 Linked tokens open their correct NPC tabs and each NPC retains its own nested attacks.
- [ ] #4 The owner records pass/fail evidence and files any observed defects in Backlog; TASK-79 live-check acceptance remains unchecked until that evidence exists.
<!-- AC:END -->
