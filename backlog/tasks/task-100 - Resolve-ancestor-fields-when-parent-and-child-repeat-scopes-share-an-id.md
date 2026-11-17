---
id: TASK-100
title: Resolve ancestor fields when parent and child repeat scopes share an id
status: To Do
assignee: []
created_date: '2026-11-17T23:10:00Z'
labels:
  - format-v4
  - review-follow-up
dependencies: []
references:
  - TASK-79
  - src/core/formula-evaluate.ts
  - _bmad-output/implementation-artifacts/task-79-window4-review.md
priority: low
type: bug
ordinal: 127000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Window-4 review finding bugs+impl-codex-7 at integration 62044f2 traces a valid but constructed preset whose parent and child both use repeat id npc. Formula lookup can treat the parent scope path as the child path and read ownBlock instead of the ancestor, returning a field error. No separate user occurrence or parent-run runtime reproduction is claimed. This is deferred from the bounded TASK-79 review; do not silently narrow the parent-local id contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A public formula or dice regression reproduces the ancestor lookup failure for a parent and child that share a repeat id, or recorded evidence disproves the traced path.
- [ ] #2 A nested formula reads the owning ancestor field when parent and child ids match; nearest-field shadowing and ordinary distinct-id lookup remain correct.
<!-- AC:END -->
