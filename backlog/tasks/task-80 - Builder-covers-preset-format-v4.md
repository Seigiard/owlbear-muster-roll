---
id: TASK-80
title: Builder covers preset format v4
status: In Progress
assignee: []
created_date: '2026-11-16T06:49:00Z'
updated_date: '2026-11-18T08:48:00Z'
labels:
  - format-v4
  - blocked
dependencies:
  - TASK-79
  - TASK-71
references:
  - _bmad-output/specs/spec-muster-roll/preset-builder.md
  - _bmad-output/specs/spec-muster-roll/stories.yaml
type: feature
ordinal: 107000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After format v4 the builder still edits v3 shapes: no row form, `kind` instead of `repeat`, a `tokens` checkbox, no token cell, no ids for scopes. The forms must follow the node registry so a GM can build every v4 preset without JSON. Story 12 of _bmad-output/specs/spec-muster-roll/stories.yaml (spec checkpoint, likely split into forms and tree first, preview and player view second); CAP-23, CAP-24, CAP-25, CAP-37.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each node kind has a form with one control per registry key: a row form with `visibility` and `repeat`; one `repeat` control on template, tab, section and row that opens `id` and `nameField`, whose choices are the `text` fields inside that scope
- [ ] #2 A token cell is added, moved and removed like any cell; a repeat scope id and a token cell id are made from the title or place, shown and rewritable like a field id, and a rename follows the block chain (CAP-25)
- [ ] #3 Turning `repeat` off, or changing a scope id, on a preset opened from a file warns that its blocks in the room will be erased
- [ ] #4 Rows drag between sections and sections between tabs; drops keep one kind of child per container
- [ ] #5 The preview draws the "+" tab and the token cell icon in the GM view only, and hides hidden sections and rows in the player view (CAP-37)
- [ ] #6 Every example preset opens, round-trips and downloads unchanged; `parsePresetFile` gates the download
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the existing locked tests at candidate517e808 for six accepted review defects. 2. Repair scoped ids, name-field defaults/choices, loaded-node warning identity, template warnings and field-rename propagation. 3. Validate and calibrate the repaired candidate, integrate TASK-109, then review and close the Builder acceptance criteria.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Window 4 preserves an UNMERGED candidate 8ddc9293745bd4e9e0220f61b42ab832490b54ee on feature/preset-v4-task-80-w4; lock d5b7e7691657e765ab3f090ae476fc1fe249063b is unchanged. Focused Builder checks pass 38/38; typecheck and commit hooks passed on recorded states. Calibration, post-implementation full unit/browser checks and integration review remain. TASK-79 closing-review blockers invalidate final baseline acceptance. Candidate includes v4 forms, scoped id suggestions and loaded-file warnings. Preserve checkout task80-builder-w4-20261117 and chain artifacts preset-v4-window4-20261117/task-80; no AC or Done claim.

Historical notes before window 4:

HISTORICAL STATUS — 2026-11-17, after closing review:
NOT STARTED. Waiting for verified TASK-79 scope-path behavior and the unresolved TASK-78 review. Only a Builder draft exists; no TASK-80 implementation was merged.

These earlier notes are superseded by the window 4 status above.

TASK-77 single-review carryover within this task: addCell currently allocates token ids from field-only taken ids, and withRepeat hard-codes repeat.id=repeat, so a second token cell/repeat section collides. sectionFromPreset also annotates an already typed row with any. Address valid unique defaults and the typed conversion while implementing the v4 forms; no separate follow-up issue is needed. Sources: src/builder/document.ts:134,417-421,539-667; review arch+quality-claude-5/8.

Not started in the autonomous TASK-78–87 continuation because TASK-79 remains blocked on full-path scope admission and import ancestry. The Builder draft is retained outside the repository and must be reconciled with a verified TASK-79 candidate before implementation.

HISTORICAL: Not started. Waiting for TASK-79 full-path validation/import repairs. The prepared Builder draft is not an accepted implementation; no TASK-80 source was merged.

CURRENT window5: preserve UNMERGED candidate517e808 on feature/preset-v4-task-80-w4, checkout task80-builder-w4-20261117. It includes runtime3d0c96a. All checks passed:3441 unit/1 skip,579 browser, format/lint/build at67effe2; corrected typecheck/format/lint at517e808, whose emitted JavaScript is identical. Three test owners calibrated. Complete mixed review03 ran through subscription,6/6 sources/no degradation: five owned major findings remain (scope-wide generated ids, tab default nameField, template nameField scope, warning identity after reorder/removal, missing template warning). Pre-existing field-rename/nameField loss is also explicitly owned by AC2. No repair round started before the window limit. Candidate spec ready-for-dev is stale; continue existing code, do not reimplement. Durable dispositions: _bmad-output/implementation-artifacts/task-80-window5-review.md. No AC or Done claim; TASK-109 runtime prerequisite and owner-only TASK-86 remain.

Window6 owner authorized repair of six accepted defects. Continue clean existing candidate517e808; new batch evidence is ~/.claude/artifacts/preset-v4-window6-20261118/task-80/. No initial implementation restart. Parent owns full browser slot and task acceptance.
<!-- SECTION:NOTES:END -->
