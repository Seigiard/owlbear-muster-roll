---
id: TASK-70
title: Type values in the builder preview with a double click
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-11-15T17:45:00Z'
updated_date: '2026-11-15T21:49:00Z'
labels:
  - one-editor
dependencies:
  - TASK-69
references:
  - _bmad-output/specs/spec-muster-roll/builder-and-dev.md
type: feature
ordinal: 97000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With a snapshot in the window, a GM needs to fill values where the sheet is, and a click on a cell must still select its tree item. Story 3 of _bmad-output/specs/spec-muster-roll/stories.yaml (done checkpoint); CAP-22, CAP-36; prototype _bmad-output/forge/one-dev-entry/prototypes/round-1.html, design 3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The first click on a preview cell selects its tree item and the form shows it
- [ ] #2 A second click or Enter on the selected cell types a value into the snapshot; Esc leaves typing and keeps the selection
- [ ] #3 A second click on a dice cell rolls
- [ ] #4 A structure edit applies to every sheet of its template
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the existing preview interaction and builder-store seams for selected-cell snapshot editing and local dice rolls.
2. Lock behavioral tests before production implementation through the tdd chain.
3. Preserve selection, Escape behavior, template-wide structure edits and whole-step history.
4. Run all changed-path checks and return the validated branch for integration; no per-ticket review.
<!-- SECTION:PLAN:END -->
