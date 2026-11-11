---
id: TASK-35
title: Offer the sheet name as the token label when a token is linked
status: To Do
assignee: []
created_date: '2026-11-11T04:41:00Z'
labels:
  - v2
dependencies: []
references:
  - _bmad-output/implementation-artifacts/spec-4-4-link-a-token-to-a-sheet.md
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner feedback after the first live check of Story 4.4 (TASK-27): linking a token to a character or an NPC should offer the text label shown under the token. Today a link changes nothing on the map, so a GM still cannot tell which token is which sheet without opening the menu. Owlbear shows a text label under a token from the item itself (for an image item, its `text`); this is an item property, not extension metadata. Story 4.4 stated "Never: writing item metadata on tokens"; changing the label writes to the scene item, so this task needs a decision on that boundary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When the GM links a token in the picker, the picker offers to set the label under the token to the sheet name, and the GM can decline
- [ ] #2 Accepting sets the label under that token to the sheet name; declining leaves the token label unchanged
- [ ] #3 A token that already has a label shows its current label in the offer, so the GM sees what will be replaced
- [ ] #4 Unlinking a token leaves its label as it is
- [ ] #5 Players cannot change token labels through Muster Roll
<!-- AC:END -->
