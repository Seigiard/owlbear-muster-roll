---
id: TASK-77
title: 'Preset format v4: one node registry for the tree'
status: To Do
assignee: []
created_date: '2026-11-16T06:49:00Z'
labels:
  - format-v4
dependencies:
  - TASK-76
references:
  - _bmad-output/specs/spec-muster-roll/preset-format.md
  - _bmad-output/specs/spec-muster-roll/stories.yaml
type: feature
ordinal: 104000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every irregularity of format v3 is a special case in the checks and the builder: `kind: set|single`, a block named by its first field, `tokens: true` bound to `repeat`, a row that is a bare array, visibility on two levels only. Format v4 gives every level the same key vocabulary: `repeat: {id, nameField}` on template, section and row, `visibility` on section and row, a token cell with an id in place of `tokens: true`, `nameField` in place of the first-field rule. Story 9 of _bmad-output/specs/spec-muster-roll/stories.yaml (spec checkpoint); CAP-2, CAP-3, CAP-5, CAP-6, CAP-8, CAP-14, CAP-18, CAP-30, CAP-35. `repeat` on a tab and a repeat scope inside another are refused by a temporary check until the two next tasks. No live users: v1-3 are refused, no converter.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The schema is `template > tab > section > row > cell` with the keys of preset-format.md "Tree": `repeat: {nameField}` on a template, `repeat: {id, nameField}` on a section and a row, `visibility` on section and row, `players: "edit"` on any template, cell kinds text, field, dice and `token {id}`; `kind` and `tokens` are gone; `v` is 4 and v1-3 presets and snapshots are refused
- [ ] #2 Rule checks refuse a duplicate id in a scope, a `nameField` that names no `text` field inside its scope, `repeat` on a tab and a repeat scope inside another (temporary), and each shows at its item in the builder and under the upload button
- [ ] #3 A sheet set is a template with `repeat`: sidebar groups, "+", sheet names, rolls and the duplicate number read `repeat.nameField`; a block key uses `repeat.id`; a repeat row draws as a block of one row
- [ ] #4 A token cell shows the GM an icon with the link status and a menu to link, unlink and select the linked tokens on the map, and players nothing; a link record names the sheet, the block path and the cell id; the picker offers the nearest ancestor name (block nameField, section title, sheet name or template title) as the label; several token cells per sheet work
- [ ] #5 A hidden section or row is invisible to players, its rolls show only on GM clients, and its token cells give players no menu, through src/core/visibility.ts
- [ ] #6 An upload that changes `repeat.id`, adds or removes `repeat`, or removes a token cell follows the table in preset-format.md "Preset changes" with one confirmation that counts the erased values
- [ ] #7 docs/preset-format.md, docs/example-preset.json (parsed by `bun test src/core/preset.test.ts`), presets/*.json, test fixtures and GLOSSARY.md (Repeat scope, Block, Token cell added; Linkable retired; Repeat section widened) describe v4
<!-- AC:END -->
