---
id: TASK-59
title: Hide a tab from players
status: To Do
assignee:
  - '@claude'
created_date: '2026-11-12T18:50:00Z'
labels:
  - v3
dependencies:
  - TASK-58
type: feature
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A GM wants a part of a visible sheet that only GMs see, such as GM notes on a character. The owner decided that a tab, like a template, can be GM-only in the preset; visibility only narrows, and there is no per-sheet runtime hiding. Today token-links.ts and the engine open path check only the template, so a tab rule must reach every reader at once. Story 2 of _bmad-output/specs/spec-muster-roll/stories.yaml; binding rules AD-4 "Rule, one edit check", AD-13, AD-18 (one core/visibility function for sheet, tab and link target), AD-19 and the Visibility convention (records filtered by template only).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A tab with visibility gm is shown to GMs and not to players; a visible template whose every tab is hidden is accepted and shows players the header with no tab
- [ ] #2 A roll from a hidden tab shows only on GM clients, and a player replica refuses a hidden roll request and sends nothing
- [ ] #3 A player gets no token menu entry, no open and no selection mark for a repeat block on a hidden tab
- [ ] #4 Every field on a hidden tab is read-only for a player, the sheet set name field included, and a GM client refuses a player proposal for such a field
- [ ] #5 Records of hidden tabs stay in every replica, so the sheet name and rolls still read them
<!-- AC:END -->
