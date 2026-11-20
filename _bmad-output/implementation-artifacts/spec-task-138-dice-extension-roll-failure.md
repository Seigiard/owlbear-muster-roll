---
title: 'TASK-138: Distinguish the dice extension roll failure type'
type: 'refactor'
created: '2026-11-20'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context: []
baseline_commit: '9f53a4917a78e0484be631b958afd0326d5638a0'
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** The replica's dice extension roll failure type shares the name `DiceExtensionFailure` with the tagged error that roll flow reports.

**Approach:** Rename the return type to `DiceExtensionRollFailure` in `src/replica/dice-extension.ts` and update its type references there and in `src/replica/roll-flow.test.ts`. Keep the tagged class, its tag, the result variants, and all runtime behavior unchanged.

</frozen-after-approval>

## Implementation Notes
