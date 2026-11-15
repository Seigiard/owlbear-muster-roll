---
id: TASK-73
title: Read, write and follow the attached files in Chromium
status: To Do
assignee: []
created_date: '2026-11-15T17:45:00Z'
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
- [ ] #1 In Chromium an edit in the page is written to the attached file at once, and the status says when
- [ ] #2 A save on disk redraws the preview with no reload
- [ ] #3 When both changed, a prompt offers «Взять из файла» or «Оставить мои»
- [ ] #4 A preset with problems is not written and the status says so; writing resumes when the problems are fixed
- [ ] #5 A file on disk that fails the checks leaves the last good content, and the block shows the refusal message
- [ ] #6 Safari and Firefox keep open and download only
- [ ] #7 The File System Access API sits behind a port with a fake for bun and Playwright tests
<!-- AC:END -->
