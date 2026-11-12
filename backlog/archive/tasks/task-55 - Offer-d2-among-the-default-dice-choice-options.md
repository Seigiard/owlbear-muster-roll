---
id: TASK-55
title: Offer d2 among the default dice-choice options
status: To Do
assignee: []
created_date: '2026-11-12T07:19:00Z'
labels: []
dependencies:
  - TASK-52
priority: low
type: feature
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A new dice-choice field in the builder starts with the options d4, d6, d8, d10, d12, d20 (`defaultDiceOptions` in `src/ui/copy.ts`). The owner wants a coin flip among them by default, so a GM does not type it by hand. The preset format already accepts d1 to d1000; only the default changes. Queue it last, after every other open task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A new dice-choice field in the builder starts with the options d2, d4, d6, d8, d10, d12, d20, in that order
- [ ] #2 Every place that documents or tests the default options says the same list
- [ ] #3 Existing presets and fields keep their own options
<!-- AC:END -->
