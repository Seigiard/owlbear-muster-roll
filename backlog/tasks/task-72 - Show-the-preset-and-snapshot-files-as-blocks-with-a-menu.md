---
id: TASK-72
title: Show the preset and snapshot files as blocks with a menu
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-15T17:45:00Z'
updated_date: '2026-11-16T09:16:00Z'
labels:
  - one-editor
dependencies:
  - TASK-69
references:
  - _bmad-output/specs/spec-muster-roll/builder-and-dev.md
type: feature
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With two documents in the builder, the GM needs to see which file each comes from and to open, save, detach or clear it in one place. Disk writes come in the next task. Story 5 of _bmad-output/specs/spec-muster-roll/stories.yaml; CAP-39; prototype _bmad-output/forge/one-dev-entry/prototypes/round-5.html, design 2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Two blocks at the right of the top bar show the kind («Пресет», «Снимок»), the file name or «черновик»/«пусто», a status dot and a status line
- [x] #2 The whole block is a button whose menu shows the path and last sync time, and offers open, open example (preset), save as, download a copy, detach and clear
- [x] #3 In this task save as downloads the file
- [x] #4 Clear asks one confirmation that names the linked file; undo restores the content
- [x] #5 The blocks replace the top bar Открыть… and Скачать buttons; GLOSSARY.md defines File block
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace top-bar file actions with preset and snapshot file blocks, using existing open/download validation.
2. Lock file menu, status, clear-confirmation and undo behavior before implementation.
3. Keep save-as as download in this task; add File block to the glossary and keep file I/O outside pure state.
4. Run all TDD and changed-path checks; no per-ticket review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The file blocks replace top-bar file actions and support download-backed save-as, detach, clear confirmation and undo. Validation recovery preserved a sample for each empty sheet set and exports the current reconciled snapshot through the established encoder. Final checks passed: 547 browser tests, 3192 unit tests with one existing environment skip, format, lint, typecheck and build.

Integration closeout: TASK-73 supersedes the intermediate download-backed Save As behavior with native Save File/Save As attachment in Chromium; Download Copy stays separate. Native-open copy filenames use the selected file name. Final integrated file-menu/browser owners and all checks pass. Unsupported browsers keep open/download only.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Preset and snapshot file blocks show each document and its actions. Save-as downloads current content. Clear names the linked file and undo restores content. GLOSSARY.md defines File block. Disk synchronization remains TASK-73; all required local checks passed.
<!-- SECTION:FINAL_SUMMARY:END -->
