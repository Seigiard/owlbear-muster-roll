---
id: TASK-38
title: Build presets without writing JSON by hand
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-11T11:15:00Z'
updated_date: '2026-11-12T00:43:00Z'
labels:
  - v2
dependencies:
  - TASK-41
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today a GM describes a sheet only by writing preset JSON by hand, which needs knowledge of the format. For the release (TASK-32) the owner accepted the agent-made d6-pool fixture as the second-system preset and postponed a hand-built one until a configurator exists. A GM should be able to build and change a preset in the extension, without editing JSON.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On a separate page of the deployed site, a GM starts blank, from a repository example or from a file, builds a preset with sheet sets and single sheets (sections, rows, labels, fields, dice cells and window) and downloads it without editing JSON (CAP-20, CAP-23)
- [x] #2 A file that fails the preset checks does not open in the builder and shows the upload's message (CAP-20)
- [x] #3 A preset downloaded from the extension opens in the builder, and a file downloaded from the builder uploads through «Загрузить пресет» (CAP-21)
- [ ] #4 The settings button in the extension opens the builder in a new tab, checked live in an Owlbear room (CAP-21)
- [x] #5 A structure tree and a form edit the preset beside a live preview drawn by the extension's own sheet components; a form edit redraws the preview at once, and a click on a preview cell selects its tree item (CAP-22)
- [x] #6 A new field gets an id from its label that follows the id rules and is unique in its scope, a label change keeps it, and the field form shows and rewrites it; renaming str rewrites str by whole word in every formula that resolves to it, leaves str_tired, and says how many formulas changed; in a preset opened from a file, a changed id warns that the room's values will be erased (CAP-24, CAP-25)
- [x] #7 After the page is closed and opened again, the builder opens on the draft with no prompt, and with no draft on an empty preset (CAP-26)
- [x] #8 Each edit kind can be undone and redone, returning the same preset each time (CAP-27)
- [x] #9 Each error shows at its tree item and its preview cell, a problem counter jumps to the first, and download is enabled only when parsePresetFile accepts the preset (CAP-28)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Forge session 2026-11-11 hardened the builder's shape: _bmad-output/forge/preset-builder/forged-idea.md. Next: bmad-spec update of SPEC.md, then bmad-ux.

2026-11-12: the owner agreed to build TASK-38 before the shadcn move (TASK-42), so the TASK-42 dependency is dropped; the shadcn branch will cover the builder afterwards.

2026-11-12: AC rewritten to match SPEC CAP-20..CAP-28; the old AC spoke of character and NPC templates and of building inside the extension, which the spec replaced with a separate builder page and the sheet set and single sheet model.

2026-11-12: built on branch worktree-agent-a924ec9329138ca78 per _bmad-output/implementation-artifacts/spec-task-38-preset-builder.md. Full check green: oxfmt, lint 0 errors, typecheck, bun test 2551 pass, test:browser 462 pass (tests/builder.e2e.ts 11), build emits builder.html with no obr chunk. AC #4 stays open: a new tab from the Settings link in a live Owlbear room is the owner's check.
<!-- SECTION:NOTES:END -->
