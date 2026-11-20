---
id: TASK-153
title: Suggest only readable fields in the Builder formula input
status: To Do
assignee: []
created_date: '2026-11-20T17:15:00Z'
labels: []
dependencies:
  - TASK-152
references:
  - src/builder/document.ts
  - src/builder/item-form.tsx
priority: low
type: bug
ordinal: 187000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Builder formula completion can suggest a field that the dice cell cannot read. A plain dice row next to a repeat row gets row_bonus as a suggestion even when row_bonus is defined only inside the repeat row. Selecting it leaves an unresolved reference and disables preset export. The same scope mismatch affects repeat-tab fields. TASK-152 validates these references but does not change completion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A dice cell never suggests an id owned only by a child or unrelated repeat block.
- [ ] #2 A dice cell still suggests readable field ids in its own block, enclosing blocks, and the sheet across plain tabs.
<!-- AC:END -->
