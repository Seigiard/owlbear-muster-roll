---
id: TASK-146
title: Finish clearing fields when a preset change is retried
status: To Do
assignee: []
created_date: '2026-11-20T07:42:00Z'
labels:
  - review-follow-up
dependencies: []
references:
  - TASK-101
  - src/core/compose.ts
  - src/replica/command-routing.ts
priority: medium
type: bug
ordinal: 181000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A confirmed preset change can save the new preset but fail to clear a repeat block field. Re-uploading the same preset then compares two copies of the new type and can report success without clearing the old value. A probe through `composePresetUpload` and `runPresetBatch` changed `status` from text to select, failed the block write after the preset write, then retried. The first plan counted one value to clear. The retry counted zero and completed with `ready` still stored.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After an interrupted confirmed preset change, a successful retry clears values that the original confirmation covered.
- [ ] #2 A retry that cannot complete the pending work does not report success.
<!-- AC:END -->
