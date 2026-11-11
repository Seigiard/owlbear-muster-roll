---
id: TASK-36
title: Roll dice through the Owlbear dice extension API
status: To Do
assignee: []
created_date: '2026-11-11T04:41:00Z'
labels:
  - v2
dependencies: []
references:
  - https://github.com/owlbear-rodeo/dice
  - https://github.com/abottchen/dicex
  - >-
    _bmad-output/implementation-artifacts/spec-4-2-roll-a-dice-cell-and-show-the-result.md
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request after the first live check of Story 4.2 (TASK-25): dice rolls should go through a dice extension so players see real 3D dice, not only a notification. Story 4.2 evaluates the formula in the roller replica with Math.random and broadcasts the result. Candidates to research: the official Owlbear dice extension (https://github.com/owlbear-rodeo/dice), the community fork https://github.com/abottchen/dicex, or a fork of our own. It is not known yet whether either exposes an API another extension can call, or how a roll result comes back. The formula parser of Story 4.1 stays the only way to read a preset formula; no eval.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The task records which dice extension and which API Muster Roll uses, or why a fork is needed, with links to the source
- [ ] #2 Pressing a dice cell rolls the dice of its formula in the dice extension, visible to the same clients that see the roll notification today
- [ ] #3 The roll notification and the comparison outcome use the dice values the dice extension rolled, not a separate local roll
- [ ] #4 When the dice extension is not installed in the room, a roll still works as in Story 4.2
- [ ] #5 An NPC roll stays hidden from players
<!-- AC:END -->
