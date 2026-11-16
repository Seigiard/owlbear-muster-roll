---
id: TASK-80
title: Builder covers preset format v4
status: To Do
assignee: []
created_date: '2026-11-16T06:49:00Z'
updated_date: '2026-11-16T22:52:00Z'
labels:
  - format-v4
dependencies:
  - TASK-79
  - TASK-71
references:
  - _bmad-output/specs/spec-muster-roll/preset-builder.md
  - _bmad-output/specs/spec-muster-roll/stories.yaml
type: feature
ordinal: 107000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After format v4 the builder still edits v3 shapes: no row form, `kind` instead of `repeat`, a `tokens` checkbox, no token cell, no ids for scopes. The forms must follow the node registry so a GM can build every v4 preset without JSON. Story 12 of _bmad-output/specs/spec-muster-roll/stories.yaml (spec checkpoint, likely split into forms and tree first, preview and player view second); CAP-23, CAP-24, CAP-25, CAP-37.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each node kind has a form with one control per registry key: a row form with `visibility` and `repeat`; one `repeat` control on template, tab, section and row that opens `id` and `nameField`, whose choices are the `text` fields inside that scope
- [ ] #2 A token cell is added, moved and removed like any cell; a repeat scope id and a token cell id are made from the title or place, shown and rewritable like a field id, and a rename follows the block chain (CAP-25)
- [ ] #3 Turning `repeat` off, or changing a scope id, on a preset opened from a file warns that its blocks in the room will be erased
- [ ] #4 Rows drag between sections and sections between tabs; drops keep one kind of child per container
- [ ] #5 The preview draws the "+" tab and the token cell icon in the GM view only, and hides hidden sections and rows in the player view (CAP-37)
- [ ] #6 Every example preset opens, round-trips and downloads unchanged; `parsePresetFile` gates the download
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TASK-77 single-review carryover within this task: addCell currently allocates token ids from field-only taken ids, and withRepeat hard-codes repeat.id=repeat, so a second token cell/repeat section collides. sectionFromPreset also annotates an already typed row with any. Address valid unique defaults and the typed conversion while implementing the v4 forms; no separate follow-up issue is needed. Sources: src/builder/document.ts:134,417-421,539-667; review arch+quality-claude-5/8.
<!-- SECTION:NOTES:END -->
