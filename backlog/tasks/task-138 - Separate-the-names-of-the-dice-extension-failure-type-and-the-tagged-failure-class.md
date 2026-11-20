---
id: TASK-138
title: >-
  Separate the names of the dice extension failure type and the tagged failure
  class
status: To Do
assignee: []
created_date: '2026-11-20T06:31:00Z'
labels:
  - replica
dependencies: []
priority: low
ordinal: 177000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two exported names collide: `src/replica/dice-extension.ts:53` exports `type DiceExtensionFailure`, the union `{ code: 'failed'; reason } | { code: 'stopped' }` that `DiceExtension.roll` returns; `src/platform/ports.ts:133` exports `class DiceExtensionFailure`, the TaggedError that `roll-flow.ts:231` reports and `src/replica/failures.ts` lists. TASK-123 removed `RollDiceFailure`, which kept the two apart inside roll-flow; `roll-flow.test.ts` now imports the union under the class's name. Rename the union (for example `DiceRollFailure` collides with core/dice-roll, so pick a free name such as `DiceExtensionRollFailure`) and update its users. Found in the TASK-123 review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `grep -rn 'type DiceExtensionFailure' src` is empty and the union has one name distinct from the class
- [ ] #2 Full check passes with no behaviour change
<!-- AC:END -->
