---
id: TASK-123
title: Roll flow uses the DiceExtension types instead of its own copies
status: To Do
assignee: []
created_date: '2026-11-19T08:23:00Z'
labels:
  - replica
dependencies: []
priority: low
ordinal: 164000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`src/replica/roll-flow.ts:43-57` declares `RollDiceReadiness`, `RollDiceFailure`, `RollDiceRequest` and `RollDicePort`, field for field equal to `DiceExtensionReadiness`, `DiceExtensionFailure`, `DiceExtensionRoll` and the `ready`/`roll` members of `DiceExtension` in `src/replica/dice-extension.ts:32-66`; the engine passes `diceExtension` as `dice` (`engine.ts:460-466`). One adapter, one hypothetical seam (codebase-design). Delete the four roll-flow types and type `dice` as `Pick<DiceExtension, "ready" | "roll">`; update the 3 outside references. Architecture review 2026-11-18, candidate 2, the one part that does not touch ADR-0004. Land after TASK-115.10 has judged roll-flow, or coordinate with that branch: it edits the same file.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `grep -rn "RollDicePort\|RollDiceReadiness\|RollDiceRequest\|RollDiceFailure" src` is empty and `createRollFlow` takes `Pick<DiceExtension, "ready" | "roll">`
- [ ] #2 Full check passes with no behaviour change; the engine suite junit list equals the baseline
<!-- AC:END -->
