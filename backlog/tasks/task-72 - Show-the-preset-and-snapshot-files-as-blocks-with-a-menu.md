---
id: TASK-72
title: Show the preset and snapshot files as blocks with a menu
status: To Do
assignee: []
created_date: '2026-11-15T17:45:00Z'
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
- [ ] #1 Two blocks at the right of the top bar show the kind («Пресет», «Снимок»), the file name or «черновик»/«пусто», a status dot and a status line
- [ ] #2 The whole block is a button whose menu shows the path and last sync time, and offers open, open example (preset), save as, download a copy, detach and clear
- [ ] #3 In this task save as downloads the file
- [ ] #4 Clear asks one confirmation that names the linked file; undo restores the content
- [ ] #5 The blocks replace the top bar Открыть… and Скачать buttons; GLOSSARY.md defines File block
<!-- AC:END -->
