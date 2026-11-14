---
id: TASK-65.1
title: Move className assembly in the UI onto clsx and cva
status: To Do
assignee: []
created_date: '2026-11-14T20:47:00Z'
labels:
  - ui
dependencies: []
references:
  - src/ui/primitives/button.tsx
  - src/ui/primitives/chip.tsx
  - src/ui/primitives/icon-button.tsx
  - src/ui/primitives/banner.tsx
  - src/ui/sheet/map-toggle.tsx
parent_task_id: TASK-65
type: task
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The first slice of TASK-65. `clsx` and `cva` enter `package.json`. The four primitives in `src/ui/primitives` (`Button`, `Chip`, `IconButton`, `Banner`) get their variants through `cva`, so a caller picks a variant by a typed name and the class strings live in one place. The other `className` sites in `src/ui`, `src/builder` and `src/preview` that join strings or branch inside a template literal move to `clsx`. Tailwind 4 scans literal class names, so every class stays written out whole, as the comments in `map-toggle.tsx` already require. The lint rule (sibling task) turns the old form into errors, so it lands only after or together with this one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `clsx` and `cva` are dependencies with pinned versions
- [ ] #2 `Button`, `Chip`, `IconButton` and `Banner` express their variants through `cva`, and callers choose a variant by name
- [ ] #3 No `className` in `src/ui`, `src/builder` or `src/preview` is a template literal with substitutions, a `+` concatenation, a ternary, an `&&` or a `.join()`
- [ ] #4 Rendered class lists are unchanged: e2e tests and unit tests pass without changes to their expectations
<!-- AC:END -->
