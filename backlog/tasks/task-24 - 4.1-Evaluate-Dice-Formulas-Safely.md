---
id: TASK-24
title: 4.1 Evaluate Dice Formulas Safely
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
labels:
  - epic-4
milestone: m-3
dependencies:
  - TASK-19
references:
  - _bmad-output/planning-artifacts/epics.md
documentation:
  - _bmad-output/specs/spec-muster-roll/SPEC.md
  - _bmad-output/specs/spec-muster-roll/preset-format.md
  - _bmad-output/specs/spec-muster-roll/storage-and-sync.md
  - >-
    _bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/EXPERIENCE.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/DESIGN.md
type: feature
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a preset author, I want formulas evaluated by a small parser, So that a shared preset cannot run code.

Story 4.1 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: Anyone who sees a sheet can roll its dice, and the right clients see the result. The GM duplicates NPCs and links tokens, and a sheet opens from its token.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Given** the formula `1d20 <= str - 2*str_tired` and filled fields **When** `core/formula` evaluates its Story 1.5 parse tree **Then** it returns one result with the roll, the target and the outcome (FR6) **And** tests with a seeded random source show the exact arithmetic
- [ ] #2 **Given** a formula with `floor` or `ceil` **When** it is evaluated **Then** the functions apply
- [ ] #3 **Given** a `check` field **When** a formula refers to it **Then** checked counts as 1, and unchecked and no key both count as 0, so an unchecked check is not an empty field
- [ ] #4 **Given** a formula id **When** it is resolved **Then** it uses the Story 1.10 resolver: same row first, then same sheet **And** an id that exists only inside a repeat section does not resolve from outside its row, and gives the field error
- [ ] #5 **Given** a formula with an empty, non-numeric or removed field **When** it is evaluated **Then** the result is an error naming the field, and no exception is thrown (FR7) **And** a `text` field counts only when the Story 1.9 number parser accepts its whole value
- [ ] #6 **Given** a formula with a division by zero or a non-finite result **When** it is evaluated **Then** the result is an error with no field name, and no exception is thrown
- [ ] #7 **Given** the code base **When** lint or review runs **Then** `src/core/formula` uses no `eval` and no `new Function` (NFR5)
<!-- AC:END -->
