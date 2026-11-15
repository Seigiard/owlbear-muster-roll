---
id: TASK-71
title: Switch the builder preview between the GM and a player
status: To Do
assignee: []
created_date: '2026-11-15T17:45:00Z'
labels:
  - one-editor
dependencies:
  - TASK-69
references:
  - _bmad-output/specs/spec-muster-roll/builder-and-dev.md
type: feature
ordinal: 98000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A GM cannot check what players see before uploading a preset; today that needs room.html with seeded clients. Story 4 of _bmad-output/specs/spec-muster-roll/stories.yaml; CAP-37; prototype _bmad-output/forge/one-dev-entry/prototypes/round-3.html, design 1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A «Мастер / Игрок» switch over the window redraws it from the same records
- [ ] #2 In the player view GM-only sheet sets, single sheets and tabs disappear, through src/core/visibility.ts
- [ ] #3 Sheets of a sheet set read only; a single sheet with players: "edit" stays editable
- [ ] #4 A sheet the GM had open that players cannot see shows a note in its place
<!-- AC:END -->
