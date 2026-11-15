---
id: TASK-70
title: Type values in the builder preview with a double click
status: Done
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
ordinal: 97000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With a snapshot in the window, a GM needs to fill values where the sheet is, and a click on a cell must still select its tree item. Story 3 of _bmad-output/specs/spec-muster-roll/stories.yaml (done checkpoint); CAP-22, CAP-36; prototype _bmad-output/forge/one-dev-entry/prototypes/round-1.html, design 3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The first click on a preview cell selects its tree item and the form shows it
- [x] #2 A second click or Enter on the selected cell types a value into the snapshot; Esc leaves typing and keeps the selection
- [x] #3 A second click on a dice cell rolls
- [x] #4 A structure edit applies to every sheet of its template
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the existing preview interaction and builder-store seams for selected-cell snapshot editing and local dice rolls.
2. Lock behavioral tests before production implementation through the tdd chain.
3. Preserve selection, Escape behavior, template-wide structure edits and whole-step history.
4. Run all changed-path checks and return the validated branch for integration; no per-ticket review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The TDD chain locked browser interactions before implementation. Final validation passed: 3192 unit tests (one existing environment skip), 537 browser tests, formatting, lint, typecheck and build. A real-preview deterministic RNG control confirmed the second-click dice route. The preview does not render a numeric dice face.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The builder selects cells on first click and edits snapshot values on second click or Enter. Escape leaves typing and keeps selection. Dice cells evaluate on second click, and structure edits still reach every template sheet. All required local checks passed.
<!-- SECTION:FINAL_SUMMARY:END -->
