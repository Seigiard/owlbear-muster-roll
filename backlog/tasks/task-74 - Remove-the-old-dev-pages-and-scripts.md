---
id: TASK-74
title: Remove the old dev pages and scripts
status: To Do
assignee: []
created_date: '2026-11-15T17:45:00Z'
labels:
  - one-editor
dependencies:
  - TASK-68
  - TASK-73
references:
  - _bmad-output/specs/spec-muster-roll/builder-and-dev.md
type: chore
ordinal: 101000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Once the builder shows both views and follows files, room.html and preview.html are three previews of one preset. Story 7 of _bmad-output/specs/spec-muster-roll/stories.yaml (done checkpoint); CAP-40.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 room.html, preview.html, the Vite preview plugin and their e2e tests are gone; the mock index.html stays for e2e tests only
- [ ] #2 package.json has no dev:mock, room or preview script
- [ ] #3 CLAUDE.md, presets/README.md, docs/preset-format.md and GLOSSARY.md (Local room) no longer name them
- [ ] #4 The full local check passes
<!-- AC:END -->
