---
id: TASK-71
title: Switch the builder preview between the GM and a player
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-11-15T17:45:00Z'
updated_date: '2026-11-15T22:43:00Z'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the integrated preview interaction with a GM/player view over the same snapshot records.
2. Lock visibility, write-policy and hidden-sheet-note behavior before implementation.
3. Reuse core visibility and preserve stable builder selection and whole-step history.
4. Run the TDD chain validation and all changed-path checks; no per-ticket review.
<!-- SECTION:PLAN:END -->
