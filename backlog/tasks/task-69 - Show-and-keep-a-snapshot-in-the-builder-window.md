---
id: TASK-69
title: Show and keep a snapshot in the builder window
status: To Do
assignee: []
created_date: '2026-11-15T17:45:00Z'
labels:
  - one-editor
dependencies: []
references:
  - _bmad-output/specs/spec-muster-roll/builder-and-dev.md
type: feature
ordinal: 96000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The builder edits only the structure of a preset, so a GM cannot see the preset with real data or fill data before an upload. The preview becomes the extension window over a snapshot. Story 2 of _bmad-output/specs/spec-muster-roll/stories.yaml (spec checkpoint); CAP-36, CAP-21, CAP-26; prototype _bmad-output/forge/one-dev-entry/prototypes/round-2.html, design 2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The preview is always the extension window: its sidebar lists the snapshot sheets, and each sheet set ends with «+ Добавить»
- [ ] #2 A sheet set with no sheets shows a pale «Образец», so its structure can still be clicked
- [ ] #3 A snapshot file opens into the builder and the snapshot downloads as a file
- [ ] #4 The draft holds the snapshot beside the preset and opens again on the next visit
- [ ] #5 Values a preset change leaves no place for drop, with no warning
- [ ] #6 The builder bundle contains no replica engine and no mock adapter
- [ ] #7 GLOSSARY.md updates Builder, Draft and Preview for the snapshot
<!-- AC:END -->
