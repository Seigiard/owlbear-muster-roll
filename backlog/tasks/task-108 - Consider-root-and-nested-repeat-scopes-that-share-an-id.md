---
id: TASK-108
title: Consider root and nested repeat scopes that share an id
status: To Do
assignee: []
created_date: '2026-11-18T08:10:00Z'
labels:
  - format-v4
  - review-follow-up
dependencies: []
references:
  - src/core/preset.ts
  - TASK-79
priority: low
type: bug
ordinal: 135000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Optional follow-up from runtime review 03-after-fix, bugs+impl-1, at 3d0c96a. A constructed valid preset places npc -> attack before an unrelated root attack with different fields. The parser accepts parent-local ids, but root lookup can select the nested row. This is distinct from TASK-100, which covers a parent and child sharing an id. Source-confirmed; no user occurrence or parent runtime reproduction of this preset is claimed. Grade minor under the owner ordinary-flow completion boundary. This does not block the current completion scope and does not authorize narrowing the published parent-local id contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 If selected, root and nested scopes with the same id retain their own fields for rendering, editing and token targets regardless of layout order.
<!-- AC:END -->
