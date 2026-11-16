---
id: TASK-84
title: Avoid repeated serialization of the same sheet root
status: To Do
assignee: []
created_date: '2026-11-16T15:15:00Z'
labels: []
dependencies: []
references:
  - src/ui/sheet/sheet-body.tsx
priority: low
type: enhancement
ordinal: 111000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After TASK-76 every plain row refers to one shared root block. sheetValuesSignature in src/ui/sheet/sheet-body.tsx still serializes that complete root once per plain row. A large sheet therefore repeats the same increasing work for each row instead of considering each unique block once. This is a code-traced scaling risk, not a measured performance incident. Deferred from the TASK-76 review at the owner request; do not add a broad benchmark project.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The formula invalidation signature considers each unique root or repeat block once per signature computation.
- [ ] #2 A change to any relevant cell on another tab still invalidates dependent formulas.
<!-- AC:END -->
