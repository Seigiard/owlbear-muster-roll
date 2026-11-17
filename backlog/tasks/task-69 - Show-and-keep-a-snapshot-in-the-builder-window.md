---
id: TASK-69
title: Show and keep a snapshot in the builder window
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-15T17:45:00Z'
updated_date: '2026-11-15T21:00:00Z'
labels:
  - one-editor
dependencies: []
references:
  - _bmad-output/specs/spec-muster-roll/builder-and-dev.md
  - _bmad-output/implementation-artifacts/spec-task-69-builder-snapshot.md
type: feature
ordinal: 101000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The builder edits only the structure of a preset, so a GM cannot see the preset with real data or fill data before an upload. The preview becomes the extension window over a snapshot. Story 2 of _bmad-output/specs/spec-muster-roll/stories.yaml (spec checkpoint); CAP-36, CAP-21, CAP-26; prototype _bmad-output/forge/one-dev-entry/prototypes/round-2.html, design 2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The preview is always the extension window: its sidebar lists the snapshot sheets, and each sheet set ends with «+ Добавить»
- [x] #2 A sheet set with no sheets shows a pale «Образец», so its structure can still be clicked
- [x] #3 A snapshot file opens into the builder and the snapshot downloads as a file
- [x] #4 The draft holds the snapshot beside the preset and opens again on the next visit
- [x] #5 Values a preset change leaves no place for drop, with no warning
- [x] #6 The builder bundle contains no replica engine and no mock adapter
- [x] #7 GLOSSARY.md updates Builder, Draft and Preview for the snapshot
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Approve _bmad-output/implementation-artifacts/spec-task-69-builder-snapshot.md at the required story-2 spec checkpoint.
2. Extend builder store steps with snapshot reconciliation, undo/redo and draft persistence.
3. Render snapshot sheets and empty-set samples through the shared window; enable each set add control.
4. Add snapshot open/download and update Builder, Draft and Preview in GLOSSARY.md.
5. Run the initial test-first chain, source-path checks, bundle inspection and initial code review.
6. Fix the two confirmed review defects, extend bounded history/refusal coverage and run one final full-check pass. Omit additional review/calibration rounds after the user challenged the excessive process.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Final source commit: 4dc32a0dc04dae163202ece2cdc28e6a8494c86c. Stable document UIDs now preserve builder sidebar identity and template marks. Add refuses invalid set IDs without throwing or changing the draft.
Final checks: 532 browser tests passed; 3166 unit tests passed with one existing environment skip. Format, lint, typecheck, production build with source maps, Backlog doctor and diff checks passed. The built builder graph has seven chunks and 489 mapped modules, with no replica or mock sources.
The two confirmed review defects are fixed. No further independent review or mutation-calibration round was run after the final scoped repair. Nonblocking deferred topics remain in _bmad-output/implementation-artifacts/deferred-work.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The builder now opens, displays, downloads and keeps a snapshot beside its preset. Empty sheet sets show a pale sample; Add creates real sheets. Preset edits reconcile values silently, and undo/redo restores the complete step.
Verified by 532 browser tests, 3166 unit tests and the full static/build checks. One existing environment skip remains. Initial review defects were fixed; no post-fix independent review round was run. Deferred scope is recorded in _bmad-output/implementation-artifacts/deferred-work.md.
<!-- SECTION:FINAL_SUMMARY:END -->
