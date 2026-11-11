---
id: TASK-24
title: 4.1 Evaluate Dice Formulas Safely
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-11T01:36:00Z'
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
- [x] #1 **Given** the formula `1d20 <= str - 2*str_tired` and filled fields **When** `core/formula` evaluates its Story 1.5 parse tree **Then** it returns one result with the roll, the target and the outcome (FR6) **And** tests with a seeded random source show the exact arithmetic
- [x] #2 **Given** a formula with `floor` or `ceil` **When** it is evaluated **Then** the functions apply
- [x] #3 **Given** a `check` field **When** a formula refers to it **Then** checked counts as 1, and unchecked and no key both count as 0, so an unchecked check is not an empty field
- [x] #4 **Given** a formula id **When** it is resolved **Then** it uses the Story 1.10 resolver: same row first, then same sheet **And** an id that exists only inside a repeat section does not resolve from outside its row, and gives the field error
- [x] #5 **Given** a formula with an empty, non-numeric or removed field **When** it is evaluated **Then** the result is an error naming the field, and no exception is thrown (FR7) **And** a `text` field counts only when the Story 1.9 number parser accepts its whole value
- [x] #6 **Given** a formula with a division by zero or a non-finite result **When** it is evaluated **Then** the result is an error with no field name, and no exception is thrown
- [x] #7 **Given** the code base **When** lint or review runs **Then** `src/core/formula` uses no `eval` and no `new Function` (NFR5)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a pure evaluator over the 1.5 parse tree with an injected random source.
2. Build field lookups on the 1.10 resolver and the 1.9 number parser.
3. Forbid eval and new Function in lint.
4. Test every matrix row with a seeded source.
Spec: _bmad-output/implementation-artifacts/spec-4-1-evaluate-dice-formulas-safely.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented src/core/formula-evaluate.ts (evaluateFormula, formulaFieldLookup) with tests in src/core/formula-evaluate.test.ts; added no-eval, no-implied-eval, no-new-func at error in .oxlintrc.json (probe file with eval/new Function/string setTimeout observed red). Format, lint, typecheck, bun test, test:browser and vite build pass. Not committed.

All seven criteria verified by unit tests with a fixed random sequence; lint rules verified with a probe file. Nothing calls the evaluator yet; Story 4.2 wires it in.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added core/formula-evaluate: evaluateFormula walks the Story 1.5 parse tree with an injected random source and returns Result<RollResult, EvaluationFailure>. RollResult holds the roll, its faces, the target, the target faces and the outcome (success when the comparison holds). Division is real; floor and ceil round; faces are clamped to [1, M]. Every step must be finite and within the safe integer range, or the result is an arithmetic error with no field name. formulaFieldLookup resolves ids through the Story 1.10 resolver (same row first, then the sheet; repeat fields only from their own row): check counts 1 or 0, number and text fields count only when the Story 1.9 parser accepts the shown text, and any other case is a field error naming the id. Nothing throws. oxlint now forbids eval, implied eval and new Function. Verified: lint, typecheck, unit tests, Playwright, build.
<!-- SECTION:FINAL_SUMMARY:END -->
