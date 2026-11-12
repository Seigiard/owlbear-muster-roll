---
id: TASK-52
title: Let a formula roll the die a dice-choice field holds
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T02:15:00Z'
updated_date: '2026-11-12T07:05:00Z'
labels:
  - v2
dependencies:
  - TASK-51
references:
  - src/core/formula.ts
  - presets/cairn-2e.json
  - _bmad-output/implementation-artifacts/deferred-work.md
type: feature
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A formula needs literal dice sizes (`1d8`), so a die cannot come from a field. In Cairn 2e every weapon has its own damage die (d6, d8, d10), an impaired attack rolls d4 and an enhanced one d12. The Cairn preset (TASK-44) therefore shows five fixed dice cells, d4 to d12, on every attack row, and the player has to remember which one to press. A dice-choice field is a select field (TASK-51) whose options are dice sizes; a formula that names it rolls the chosen die. Then one dice cell per attack rolls the right die. Formulas are shared preset content, so they still run only through the parser in src/core/formula.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A preset field of type dice-choice lists die sizes as its options and shows as a select field on the sheet
- [x] #2 A dice cell formula can roll the die chosen in a dice-choice field of its scope, with a count and arithmetic around it, for example one die of the chosen size plus a bonus field
- [x] #3 A roll with no die chosen fails with the field error that names the field, as a roll with an empty number field does
- [x] #4 The preset check refuses a formula that uses a dice-choice field where a number is expected, or a number field where a die is expected, and names the cell
- [ ] #5 The roll result and the Owlbear dice extension roll show the die that was rolled
- [x] #6 presets/cairn-2e.json gives each weapon and each NPC attack one dice-choice field and one damage dice cell, and the deferred-work entry about die sizes from a field is closed
- [x] #7 docs/preset-format.md, the spec copy of the format and docs/example-preset.json describe the field and the formula syntax; the example parse test passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Build through bmad-build: spec _bmad-output/implementation-artifacts/spec-task-52-dice-choice-field.md, implemented by the implement skill (tdd chain, then code-review). 1. Docs (glossary, spec/UX/arch memlogs) in 999e137. 2. core: Nd(id) parse, resolve to NdM before terms/evaluation, roll label, preset type check and die-option rule. 3. field-patch, migrate, import, rename. 4. sheet picker, copy, preview, builder «Выбор кубика». 5. docs/preset-format.md, example preset, Cairn preset, deferred-work close. 6. Full check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built on branch worktree-agent-ae8e52c72e538da97 (HEAD 6f2396d) through bmad-build: implement (tdd chain, 3 batches, every calibration entry calibrated) and code-review (2 revmux rounds; round 1: 1 major + 2 minor, all fixed; round 2: 0). Full check at 6f2396d: oxfmt clean, lint exit 0, typecheck exit 0, bun test 2621/0, test:browser 480 passed, build ok. Evidence: AC1 tests/dice-choice-field.e2e.ts (picker) + preset.test; AC2/AC3 src/core/dice-roll.test.ts, formula.test.ts, e2e 'empty dice-choice field shows its labelled field error'; AC4 preset.test (die-field-as-number, field-not-die); AC6 preset.test parses presets/cairn-2e.json, deferred-work entry marked resolved; AC7 docs + example parse test. AC5 is open: the mock proves the notification names 1d8; the 3D roll in Dice+/dicex needs the owner's live check. Cairn: one dice-choice field per weapon (weapon_die) and per NPC attack (attack_1_die, attack_2_die), options d4..d12; the damage cell rolls 1d(<die>). Impaired/enhanced = the player picks d4 or d12 in the same field.
<!-- SECTION:NOTES:END -->
