---
id: TASK-82
title: Preserve untouched cell versions during preset reconciliation
status: To Do
assignee: []
created_date: '2026-11-16T15:15:00Z'
labels: []
dependencies: []
references:
  - src/replica/composers.ts
  - src/core/preset-migrate.ts
  - _bmad-output/implementation-artifacts/spec-task-76-block-records.md
priority: high
type: bug
ordinal: 109000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Review of TASK-76 found two preset-change edge cases in src/replica/composers.ts. composePresetUpload reissues every planned cell at the upload version, so removing one field can overwrite a concurrent edit of an untouched field; the reviewer reproduced hp=10 instead of hp=20. mintedPatch omits fields removed by stripToTemplate rather than emitting null cells, so a write after an interrupted preset upload can retain obsolete values on merge. The owner requested follow-up issues instead of extending TASK-76. These scenarios concern preset changes concurrent with edits or interrupted uploads; ordinary different-cell editing is covered by the passing TASK-76 tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Removing armor while another GM updates hp preserves the exact concurrent hp value and its cell version.
- [ ] #2 A field removed by the current preset receives a versioned clear during subsequent reconciliation, so old values cannot return through merge.
- [ ] #3 Targeted regressions cover concurrent preset upload and edit, and a field write after an interrupted upload.
<!-- AC:END -->
