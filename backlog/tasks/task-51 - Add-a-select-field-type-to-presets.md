---
id: TASK-51
title: Add a select field type to presets
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T02:15:00Z'
updated_date: '2026-11-12T04:47:00Z'
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
- [x] #1 A preset field of type select lists its options, and the sheet shows a picker with exactly those options
- [x] #2 The preset check refuses a select field with no options or with a repeated option, and names the field
- [ ] #3 A GM, and a player with write access to the sheet, picks an option; the choice syncs to every client as any field value does; a reader without write access sees the value read-only
- [x] #4 A stored value that is no longer among the options, as a changed preset leaves it, still shows and can be replaced
- [ ] #5 The picker works by keyboard, has an accessible name from its label, a 32 px touch target and the focus outline of the Accessibility Floor
- [x] #6 The preset builder can add a select field and edit its options
- [x] #7 docs/preset-format.md, the spec copy of the format and docs/example-preset.json describe the select field; the example parse test passes
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built through bmad-build -> implement (tdd chain on hc/opencode children, then code-review). Run dir ~/.claude/artifacts/tdd-20261112-034248/task-51-select-field/. Commits: d397286 test, f6d8023 feat, 6c03a2c docs, 49e4395 spec record, 7fb5bda typed test fixtures (review patch).
Review: revmux round 1 (mixed-terra, 9/9 sources) -> 7 fixes in tdd batch 2 (options textarea is one undo step; snapshot import keeps select values in repeat blocks; repeat-block text->select test; builder preview draws a select cell as read-only text per EXPERIENCE; modified arrows stay native; one value-selection function; docs walkthrough options). Round 2 (final, 2/2) found nothing. Step 04 carry-over: Reflect.set fixtures patched; 3 low findings rejected (edge-space options trimmed by the builder; unmount save after a concurrent type change; silent too-large pick).
Full check at 7fb5bda: oxfmt 0, lint 0, typecheck 0, bun test 2581 pass, test:browser 476 passed, build 0.
AC evidence: #1 tests/select-field.e2e.ts 'a GM picker lists the preset options in order...'; #2 preset.test.ts presetProblems cases + 3 upload-refusal e2e; #4 'a stale stored value is selected...' e2e + preset-migrate.test.ts options-only/type-change cases; #6 builder.e2e.ts select test + undo test; #7 example parse test asserts a select field, docs updated (spec copy updated earlier on master 95b6aff).
Left for the owner's live check: #3 (sync to every client and a player's pick reaching the GM in a live Owlbear room; mock e2e passes) and #5 (keyboard, name and 32 px pass in Chromium; the native picker's look and focus outline in both Owlbear themes).
<!-- SECTION:NOTES:END -->
