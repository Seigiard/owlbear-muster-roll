---
id: TASK-87
title: Remove retired v3 assumptions from v4 internals and comments
status: To Do
assignee: []
created_date: '2026-11-16T22:52:00Z'
labels:
  - format-v4
dependencies: []
references:
  - src/core/link-target.ts
  - src/core/preset-migrate.ts
  - src/core/repeat-block-duplicate.ts
  - src/ui/main.tsx
  - 'TASK-77 review: arch+quality-claude-6/7/12'
  - lean-codex-2
  - docs+tests-claude-6
  - arch+quality-claude-11
priority: low
type: chore
ordinal: 114000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The single TASK-77 review found v3-only paths still present after stable repeat ids and token cells replaced the old model. liveLinkTarget constructs a block index that it never reads; preset-migrate retains an unreachable relocation pass; first-field and linkable comments describe retired behavior. Duplicate unused exports and the literal picker popover id add avoidable maintenance traps. These are source-traced cleanup findings, not measured performance incidents, and are outside the remaining feature acceptance work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Link resolution and preset reconciliation no longer construct unused indexes or execute unreachable relocation preparation; surviving values, order and clear markers stay unchanged.
- [ ] #2 Touched comments describe explicit repeat.nameField and token-cell targets, with no retired first-field or tokens/linkable guarantee.
- [ ] #3 Unused duplicate preset helpers are removed and the token-cell picker opener shares the existing popover id constant.
<!-- AC:END -->
