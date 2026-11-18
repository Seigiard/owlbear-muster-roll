---
id: TASK-112
title: Keep loaded-file warnings when opening a preset identical to the current draft
status: To Do
assignee: []
created_date: '2026-11-18T09:59:00Z'
labels:
  - format-v4
  - review-follow-up
  - optional-follow-up
dependencies: []
references:
  - TASK-80
  - src/builder/builder-page.tsx:159-165
  - src/builder/builder-store.ts
priority: low
type: bug
ordinal: 138000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-80 confirming review05 found a narrow loaded-warning gap. Build an origin-less draft or open an example, save its preset, then open that identical file. BuilderPage.open attaches the file but skips store.open because samePreset is true, leaving origin null and no original repeat identity. A subsequent repeat id change or repeat removal has no early Builder warning. Runtime upload still confirms destructive changes, so this is a minor follow-up and does not block the bounded preset-v4 completion. Source-confirmed at6695d234; finding bugs+impl-1, severity minor/refined.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Opening the same preset file as an origin-less draft establishes loaded-file warning identity.
- [ ] #2 A later repeat id change or removal warns about the correct original room block.
- [ ] #3 Attaching an identical preset preserves the current snapshot records and edited values.
<!-- AC:END -->
