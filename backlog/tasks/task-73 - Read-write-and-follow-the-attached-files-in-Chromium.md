---
id: TASK-73
title: Read, write and follow the attached files in Chromium
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-11-15T17:45:00Z'
updated_date: '2026-11-16T01:32:00Z'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Introduce the browser file-access port with Chromium implementation and Bun/Playwright fakes, without reload reattachment.
2. Lock page-write, external-follow, conflict-choice, refusal and unsupported-browser behavior before production implementation.
3. Integrate write/follow through the existing file blocks, pure flow decisions and React-owned effects.
4. Preserve current snapshot encoding, per-empty-set samples, history, visibility and field semantics; run all chain and changed-path checks.
<!-- SECTION:PLAN:END -->
