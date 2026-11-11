---
id: TASK-40
title: Preview a preset locally while editing it
status: To Do
assignee: []
created_date: '2026-11-11T17:27:00Z'
labels:
  - v2
dependencies: []
type: feature
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A preset's look can be checked today only by uploading it in a live Owlbear room or by loading it by hand in the mock dev mode. Each change to the JSON needs a new upload, so iterating on a sheet layout is slow. The owner wants a local page that shows a preset as the extension draws it and redraws on each save. It also becomes the preview part of the preset builder (TASK-38). Owner's choice of file selection: the page lists the presets kept in the repository, and a path given at launch (for example `bun run preview ~/presets/my-sheet.json`) joins that list and opens first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One command starts the preview page with no Owlbear room
- [ ] #2 The page lists the preset files kept in the repository (docs/example-preset.json, tests/fixtures/presets/ and a presets folder) and shows the one chosen; the choice is kept in the page address
- [ ] #3 A preset path given to the launch command, anywhere on disk, is added to the list and opens first
- [ ] #4 The chosen preset shows as the extension draws it: a character sheet and an NPC sheet with sample content, including repeated rows and dice cells
- [ ] #5 Saving the chosen file redraws the page without a manual reload
- [ ] #6 A file that fails the preset checks shows the same failure message as an upload, and the page recovers when the file is fixed
- [ ] #7 The window size from the preset's window key, or 600 by 600 without it, frames the sheet
<!-- AC:END -->
