---
id: TASK-65.3
title: Record the clsx and cva convention in CLAUDE.md
status: To Do
assignee: []
created_date: '2026-11-14T20:48:00Z'
labels:
  - docs
dependencies:
  - TASK-65.1
references:
  - CLAUDE.md
parent_task_id: TASK-65
type: docs
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The written half of the TASK-65 guard. The lint rule catches string assembly in `className`, but it cannot tell a variant map indexed by a prop from ordinary property access, so the rule that a control with variants uses `cva` is a convention. CLAUDE.md carries it in an `<important if>` block for an agent that writes or changes UI components, next to the existing block about interface text. The block names `clsx` for ad-hoc conditional classes, `cva` for variants, and the lint rule that enforces the first, in one or two lines each. GLOSSARY.md is unaffected: `clsx` and `cva` are not domain terms.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CLAUDE.md has an `<important if>` block for writing or changing UI components that names `clsx` for conditional classes, `cva` for variants, and the lint rule that enforces hand-assembled `className` values
- [ ] #2 The block follows the `writing-for-agents` skill: short, imperative, no restating of what the lint already checks
<!-- AC:END -->
