---
id: TASK-51
title: Add a select field type to presets
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T02:15:00Z'
updated_date: '2026-11-12T02:34:00Z'
labels:
  - v2
dependencies: []
references:
  - docs/preset-format.md
  - presets/cairn-2e.json
type: feature
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A field can hold only text, a number or a check today. Games have many values that come from a short fixed list: a class, an armour type, a weapon die, a condition. With a text field the GM types the value by hand, typos break formulas and filters, and a player cannot see the allowed values. A select field lists its options in the preset, and the sheet shows a picker with those options only. The Cairn 2e preset (TASK-44) is the first preset that needs it; a dice-choice variant of this field is tracked as a separate task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A preset field of type select lists its options, and the sheet shows a picker with exactly those options
- [ ] #2 The preset check refuses a select field with no options or with a repeated option, and names the field
- [ ] #3 A GM, and a player with write access to the sheet, picks an option; the choice syncs to every client as any field value does; a reader without write access sees the value read-only
- [ ] #4 A stored value that is no longer among the options, as a changed preset leaves it, still shows and can be replaced
- [ ] #5 The picker works by keyboard, has an accessible name from its label, a 32 px touch target and the focus outline of the Accessibility Floor
- [ ] #6 The preset builder can add a select field and edit its options
- [ ] #7 docs/preset-format.md, the spec copy of the format and docs/example-preset.json describe the select field; the example parse test passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Spec: _bmad-output/implementation-artifacts/spec-task-51-select-field.md
1. Core: select field schema with options, option rules (no options, blank, repeated) naming the field, select value type, same-type rule in preset migration.
2. Sheet: native select picker saving at once through field-patch; stale value shown; read-only text for readers.
3. Builder: type «Список», options edited one per line.
4. Docs: preset-format (user doc + spec copy via memlog), example preset, glossary, EXPERIENCE and architecture via memlogs.
5. Tests: unit beside sources, e2e on the mock; review; full check.
<!-- SECTION:PLAN:END -->
