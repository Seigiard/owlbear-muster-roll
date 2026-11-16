---
id: TASK-73
title: Read, write and follow the attached files in Chromium
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-15T17:45:00Z'
updated_date: '2026-11-16T03:47:00Z'
labels:
  - one-editor
dependencies:
  - TASK-72
references:
  - _bmad-output/specs/spec-muster-roll/builder-and-dev.md
type: feature
ordinal: 100000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner wants to edit a preset or snapshot in a text editor and in the page, with both staying in sync, which replaces the preview page file follow. Story 6 of _bmad-output/specs/spec-muster-roll/stories.yaml (spec and done checkpoints); CAP-38. Whether to reattach files after a reload is an open question in SPEC.md: do not build reattach.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In Chromium an edit in the page is written to the attached file at once, and the status says when
- [x] #2 A save on disk redraws the preview with no reload
- [x] #3 When both changed, a prompt offers «Взять из файла» or «Оставить мои»
- [x] #4 A preset with problems is not written and the status says so; writing resumes when the problems are fixed
- [x] #5 A file on disk that fails the checks leaves the last good content, and the block shows the refusal message
- [x] #6 Safari and Firefox keep open and download only
- [x] #7 The File System Access API sits behind a port with a fake for bun and Playwright tests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Introduce the browser file-access port with Chromium implementation and Bun/Playwright fakes, without reload reattachment.
2. Lock page-write, external-follow, conflict-choice, refusal and unsupported-browser behavior before production implementation.
3. Integrate write/follow through the existing file blocks, pure flow decisions and React-owned effects.
4. Preserve current snapshot encoding, per-empty-set samples, history, visibility and field semantics; run all chain and changed-path checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Attached files now write and follow through the typed port. Save File/Save As writes and attaches the selected handle; Download Copy stays separate. Recovery protects companion snapshot values on preset follow and preserves conflict choices after pending writes. Clear/Undo updates both page and linked file. Final checks passed: 3208 unit tests (one existing environment skip), 547 browser tests, formatting, lint, types and build. Mutation controls and a fresh real-Chromium OPFS handle control passed. Native picker permission/cancellation and actual external OS-process delivery remain unverified.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Chromium file blocks write page edits, follow valid disk changes, show refusals and keep both conflict choices. Invalid drafts pause writes until repaired. Save As attaches the selected file; confirmed Clear and Undo update both copies. Other browsers keep open/download only, with no reload reattachment. Local checks and native OPFS flow control passed; picker permission and OS-process delivery still need manual observation.
<!-- SECTION:FINAL_SUMMARY:END -->
