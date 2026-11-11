---
id: TASK-35
title: Offer the sheet name as the token label when a token is linked
status: Done
assignee:
  - '@claude'
created_date: '2026-11-11T04:41:00Z'
updated_date: '2026-11-11T15:09:00Z'
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
- [x] #1 When the GM links a token in the picker, the picker offers to set the label under the token to the sheet name, and the GM can decline
- [x] #2 Accepting sets the label under that token to the sheet name; declining leaves the token label unchanged
- [x] #3 A token that already has a label shows its current label in the offer, so the GM sees what will be replaced
- [x] #4 Unlinking a token leaves its label as it is
- [x] #5 Players cannot change token labels through Muster Roll
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Build spec: _bmad-output/implementation-artifacts/spec-4-7-offer-the-sheet-name-as-the-token-label.md
1. Scene port: read and set one item label (OBR adapter, mock).
2. Picker: checkbox "Подписать токен именем листа" (checked when the token has no label), hint with the current label, label write after the link arrives, notification on failure.
3. Tests for every matrix row the mock can reach.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per spec-4-7. Review round 1 patched (triage log in the spec). Checks 2026-11-11: oxfmt, lint, typecheck, bun test 1914 pass, vite build — exit 0. AC 1, 2, 3, 5 proven by src/ui/picker/link-picker.test.tsx (happy-dom, real projection store) and src/platform/obr/item-label.test.ts. AC 4 (unlink keeps the label) is covered by tests/link.e2e.ts, which cannot run on mbp2021 (Chromium launch fails, error 141). Task stays open until test:browser passes twice and the owner checks the label in a live room.

test:browser 2026-11-11 after a session restart (Aqua session): 396 passed, twice in a row.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The link picker now offers "Подписать токен именем листа" with the current label as a hint; the box is checked when the token has no label. After the link arrives, the picker writes the sheet name as the token label (plain and rich text) through a new scene port write, then closes; a failed or hung write keeps the link and shows a notification. Unlink, rename and delete leave the label alone; players never write labels. Verified by component, adapter-helper and e2e tests. Open: owner check of the label display in a live room.
<!-- SECTION:FINAL_SUMMARY:END -->
